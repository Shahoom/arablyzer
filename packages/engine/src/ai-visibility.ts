import {
  organizationalDomain,
  type AiAnswer,
  type AiProviderId,
  type AiProviderResult,
  type AiVisibilityFacts,
  type PageFacts,
} from '@arablyzer/collectors'
import { collectBrandNames, COUNTRY_NAMES, inferCountry, nameKey, readPage } from '@arablyzer/rules'
import { json, pooled, TtlCache, type Ask, type AskRequest, type AskResponse } from './outside-http'

/**
 * Do the AI assistants mention or cite the site? (docs/design/plans/arabic-native.md §13.) Up to
 * five Arabic questions made from the page's title, h1 and description are put to each assistant
 * whose key the operator gave, with its web search on; the answer is read for the brand's name, the
 * site's domain and the domains cited, and thrown away. The model ids were read from each provider's
 * documentation on 2026-10-04 and can be changed with ARABLYZER_<PROVIDER>_MODEL.
 */

export const MAX_QUESTIONS = 5
/** Most requests a run may make: questions times providers, never more than this. */
export const MAX_CALLS = 20
/** The longest answer asked for, in tokens (Gemini's API names none; its prompt asks for brevity). */
export const MAX_ANSWER_TOKENS = 600
const CALL_TIMEOUT_MS = 60_000
export const AI_TOTAL_MS = 110_000
const CONCURRENCY = 4
const CACHE_MS = 24 * 60 * 60 * 1000
const MAX_BODY_BYTES = 2 * 1024 * 1024

export const DEFAULT_MODELS: Readonly<Record<AiProviderId, string>> = {
  openai: 'gpt-6-luna',
  gemini: 'gemini-3.8-flash',
  perplexity: 'preset:fast',
  anthropic: 'claude-sonnet-5-5',
}

export interface AiVisibilityOptions {
  /** Each provider's API key (ARABLYZER_OPENAI_KEY, _GEMINI_KEY, _PERPLEXITY_KEY, _ANTHROPIC_KEY). */
  readonly keys: Readonly<Partial<Record<AiProviderId, string>>>
  readonly models?: Readonly<Partial<Record<AiProviderId, string>>>
  readonly maxQuestions?: number
}

export const PROVIDERS: readonly AiProviderId[] = ['openai', 'gemini', 'perplexity', 'anthropic']

const BREVITY = 'أجب بإيجاز في ثلاث جمل على الأكثر، وسمِّ المواقع أو العلامات التي تنصح بها.'

/** The questions: made from the page by fixed templates, in Arabic, the most telling first. */
export function questionsFor(
  page: PageFacts,
  max = MAX_QUESTIONS,
): { brand: string | null; topic: string | null; questions: string[] } {
  const names = collectBrandNames(page)
  const brandCandidate =
    names.candidates.find((item) => item.script === 'ar') ?? names.candidates[0]
  const brand = brandCandidate?.name ?? null
  const heading = page.html?.headings.find((item) => item.level === 1)?.text ?? ''
  const title = (page.html?.title ?? '').split(/\s+[|–—·•-]\s+/)[0] ?? ''
  const raw = (heading !== '' ? heading : title).replace(/\s+/g, ' ').trim()
  const topic = raw === '' ? null : raw.split(' ').slice(0, 6).join(' ')
  const inferred = inferCountry(readPage(page))
  const country =
    inferred.confidence === 'strong' && inferred.country !== null
      ? ` في ${COUNTRY_NAMES[inferred.country].ar}`
      : ''
  const questions: string[] = []
  if (topic !== null) {
    questions.push(`ما أفضل المواقع أو المتاجر لـ${topic}${country}؟`)
    questions.push(`من أين أشتري أو أطلب ${topic}${country}؟`)
  }
  if (brand !== null) {
    questions.push(`هل ${brand} موقع موثوق؟ وما رأي الناس فيه؟`)
    if (topic !== null) questions.push(`ما بدائل ${brand} في ${topic}؟`)
  }
  if (topic !== null) questions.push(`كيف أختار ${topic} المناسب؟`)
  return { brand, topic, questions: questions.slice(0, Math.min(max, MAX_QUESTIONS)) }
}

interface Parsed {
  readonly text: string
  readonly urls: readonly string[]
}

interface Adapter {
  request(question: string, key: string, model: string): AskRequest
  parse(body: unknown): Parsed
}

/** Every `url` under annotations, citations, search results or grounding sources, in any shape. */
function urlsIn(value: unknown, depth = 0, within = false, out: string[] = []): string[] {
  if (depth > 12 || typeof value !== 'object' || value === null) return out
  if (Array.isArray(value)) {
    for (const item of value as unknown[]) {
      if (typeof item === 'string' && within && /^https?:\/\//i.test(item)) out.push(item)
      else urlsIn(item, depth + 1, within, out)
    }
    return out
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const here =
      within ||
      /^(annotations|citations|search_results|results|sources|grounding_chunks|groundingChunks|web|content)$/i.test(
        key,
      )
    if (
      (key === 'url' || key === 'uri') &&
      typeof item === 'string' &&
      here &&
      /^https?:\/\//i.test(item)
    )
      out.push(item)
    else urlsIn(item, depth + 1, here && key !== 'content' ? true : within, out)
  }
  return out
}

function textsIn(value: unknown, depth = 0, out: string[] = []): string[] {
  if (depth > 12 || typeof value !== 'object' || value === null) return out
  if (Array.isArray(value)) {
    for (const item of value as unknown[]) textsIn(item, depth + 1, out)
    return out
  }
  const record = value as Record<string, unknown>
  if (
    (record.type === 'text' || record.type === 'output_text') &&
    typeof record.text === 'string'
  ) {
    out.push(record.text)
  }
  for (const item of Object.values(record)) textsIn(item, depth + 1, out)
  return out
}

const stringOf = (value: unknown): string => (typeof value === 'string' ? value : '')

export const ADAPTERS: Readonly<Record<AiProviderId, Adapter>> = {
  // https://developers.openai.com/api/docs/guides/tools-web-search (Responses API)
  openai: {
    request: (question, key, model) => ({
      url: 'https://api.openai.com/v1/responses',
      headers: { authorization: `Bearer ${key}` },
      json: {
        model,
        input: `${question}\n${BREVITY}`,
        tools: [{ type: 'web_search' }],
        max_output_tokens: MAX_ANSWER_TOKENS,
        store: false,
      },
    }),
    parse: (body) => ({
      text: textsIn((body as { output?: unknown }).output).join('\n'),
      urls: urlsIn((body as { output?: unknown }).output),
    }),
  },
  // https://ai.google.dev/gemini-api/docs/google-search (Interactions API)
  gemini: {
    request: (question, key, model) => ({
      url: 'https://generativelanguage.googleapis.com/v1beta/interactions',
      headers: { 'x-goog-api-key': key },
      json: {
        model,
        input: `${question}\n${BREVITY}`,
        tools: [{ type: 'google_search' }],
        store: false,
      },
    }),
    parse: (body) => {
      const record = body as { output_text?: unknown } | null
      const texts = textsIn(body)
      return {
        text:
          stringOf(record?.output_text) !== '' ? stringOf(record?.output_text) : texts.join('\n'),
        urls: urlsIn(body),
      }
    },
  },
  // https://docs.perplexity.ai/api-reference/agent-post (the Sonar chat completions ended 2026-09-27)
  perplexity: {
    request: (question, key) => ({
      url: 'https://api.perplexity.ai/v1/agent',
      headers: { authorization: `Bearer ${key}` },
      json: {
        input: `${question}\n${BREVITY}`,
        preset: 'fast',
        tools: [{ type: 'web_search' }],
        max_tokens: MAX_ANSWER_TOKENS,
      },
    }),
    parse: (body) => ({ text: textsIn(body).join('\n'), urls: urlsIn(body) }),
  },
  // https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
  anthropic: {
    request: (question, key, model) => ({
      url: 'https://api.anthropic.com/v1/messages',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      json: {
        model,
        max_tokens: MAX_ANSWER_TOKENS,
        messages: [{ role: 'user', content: `${question}\n${BREVITY}` }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
      },
    }),
    parse: (body) => {
      const content = (body as { content?: unknown }).content
      const blocks = Array.isArray(content) ? (content as Record<string, unknown>[]) : []
      const urls: string[] = []
      for (const block of blocks) {
        if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
          for (const result of block.content as Record<string, unknown>[])
            urls.push(stringOf(result.url))
        }
        if (block.type === 'text' && Array.isArray(block.citations)) {
          for (const citation of block.citations as Record<string, unknown>[])
            urls.push(stringOf(citation.url))
        }
      }
      return {
        text: blocks
          .filter((block) => block.type === 'text')
          .map((block) => stringOf(block.text))
          .join('\n'),
        urls: urls.filter((url) => /^https?:\/\//i.test(url)),
      }
    },
  },
}

const domainOf = (url: string): string | null => {
  try {
    return organizationalDomain(new URL(url).hostname)
  } catch {
    return null
  }
}

export interface Targets {
  readonly brandKeys: readonly string[]
  readonly domain: string
}

/** What one answer says of the site: named, cited, and which other domains are cited. */
export function judgeAnswer(
  parsed: Parsed,
  targets: Targets,
): Omit<AiAnswer, 'question' | 'status'> {
  const key = nameKey(parsed.text)
  const hostMentioned = parsed.text.toLowerCase().includes(targets.domain)
  const domains = [...new Set(parsed.urls.flatMap((url) => domainOf(url) ?? []))]
  const cited = domains.includes(targets.domain)
  const named = targets.brandKeys.some((brand) => brand.length >= 4 && key.includes(brand))
  return {
    mentioned: named || hostMentioned || cited,
    cited,
    citations: [...new Set(parsed.urls)].slice(0, 10).map((url) => url.slice(0, 300)),
    competitors: domains.filter((domain) => domain !== targets.domain).slice(0, 10),
  }
}

const cache = new TtlCache<{
  answer: Omit<AiAnswer, 'question'>
  status: AiProviderResult['status']
}>(CACHE_MS, 200)

/** Forgets the answers kept (for tests). */
export function clearAiCache(): void {
  cache.clear()
}

export interface AiContext {
  readonly ask: Ask
  readonly options: AiVisibilityOptions
  readonly hostname: string
  readonly signal?: AbortSignal
}

const statusOfHttp = (response: AskResponse | null): AiProviderResult['status'] =>
  response === null
    ? 'failed'
    : response.status === 401 || response.status === 403
      ? 'refused'
      : response.status === 429
        ? 'limited'
        : response.status >= 200 && response.status < 300
          ? 'ok'
          : 'failed'

/**
 * Puts the questions to each provider with a key. The answers are reduced to mentions and
 * citations at once; nothing the assistants wrote is kept, in the report or in the cache (which
 * holds the reduced result for a day, never longer than a report is kept).
 */
export async function askAssistants(
  page: PageFacts,
  context: AiContext,
): Promise<AiVisibilityFacts> {
  const providers = PROVIDERS.filter((id) => (context.options.keys[id] ?? '').trim() !== '')
  const { brand, questions } = questionsFor(page, context.options.maxQuestions)
  const domain = organizationalDomain(context.hostname)
  if (questions.length === 0 || domain === null) return { outcome: 'no-questions' }
  const names = collectBrandNames(page)
  const brandKeys = [...new Set(names.candidates.map((item) => item.key))].slice(0, 6)
  const targets: Targets = { brandKeys, domain }
  const jobs = providers
    .flatMap((provider) => questions.map((question) => ({ provider, question })))
    .slice(0, MAX_CALLS)
  let calls = 0
  const blocked = new Set<AiProviderId>()
  const results = await pooled(
    jobs,
    CONCURRENCY,
    0,
    context.signal,
    async ({ provider, question }) => {
      const model = context.options.models?.[provider] ?? DEFAULT_MODELS[provider]
      const cacheKey = `${provider}|${model}|${domain}|${question}`
      const cached = cache.get(cacheKey)
      if (cached !== undefined) return { provider, question, ...cached }
      if (blocked.has(provider)) {
        return { provider, question, answer: failedAnswer(), status: 'failed' as const }
      }
      const adapter = ADAPTERS[provider]
      const key = (context.options.keys[provider] ?? '').trim()
      calls++
      const response = await context.ask({
        ...adapter.request(question, key, model),
        accept: 'application/json',
        timeoutMs: CALL_TIMEOUT_MS,
        maxBytes: MAX_BODY_BYTES,
        ...(context.signal === undefined ? {} : { signal: context.signal }),
      })
      const status = statusOfHttp(response)
      if (status === 'refused' || status === 'limited') blocked.add(provider)
      if (status !== 'ok' || response === null)
        return { provider, question, answer: failedAnswer(), status }
      const body = json(response)
      if (body === null)
        return { provider, question, answer: failedAnswer(), status: 'failed' as const }
      const answer = { status: 'answered' as const, ...judgeAnswer(adapter.parse(body), targets) }
      const kept = { answer, status: 'ok' as const }
      cache.set(cacheKey, kept)
      return { provider, question, ...kept }
    },
  )
  const done = results.filter((item): item is NonNullable<typeof item> => item !== undefined)
  const out: AiProviderResult[] = providers.map((provider) => {
    const mine = done.filter((item) => item.provider === provider)
    const status =
      mine.find((item) => item.status === 'refused')?.status ??
      mine.find((item) => item.status === 'limited')?.status ??
      (mine.some((item) => item.status === 'ok') ? 'ok' : 'failed')
    return {
      provider,
      model: context.options.models?.[provider] ?? DEFAULT_MODELS[provider],
      status,
      answers: mine.map((item) => ({ question: item.question, ...item.answer })),
    }
  })
  if (!out.some((item) => item.answers.some((answer) => answer.status === 'answered'))) {
    return {
      outcome: 'failed',
      statuses: out.map(({ provider, status }) => ({ provider, status })),
    }
  }
  return { outcome: 'checked', brand, domain, questions, providers: out, calls }
}

function failedAnswer(): Omit<AiAnswer, 'question'> {
  return { status: 'failed', mentioned: false, cited: false, citations: [], competitors: [] }
}

import { collectPage } from '@arablyzer/collectors'
import { createPolicy } from '@arablyzer/egress'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ADAPTERS,
  askAssistants,
  clearAiCache,
  judgeAnswer,
  MAX_ANSWER_TOKENS,
  MAX_CALLS,
  questionsFor,
} from '../src/ai-visibility'
import { scan } from '../src/index'
import type { Ask, AskRequest } from '../src/outside-http'
import { tempSite, type TempSite } from './helpers'

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
const source = `<!doctype html><html lang="ar"><head><meta charset="utf-8"><title>قهوة الواحة | قهوة مختصة</title><script type="application/ld+json">{"@type":"Organization","name":"قهوة الواحة"}</script></head><body><h1>قهوة مختصة محمصة</h1></body></html>`
const pageOf = () =>
  collectPage({
    url: 'https://www.alwaha.com.sa/',
    status: 200,
    headers: [['content-type', 'text/html; charset=utf-8']],
    body: new TextEncoder().encode(source),
    certificate: null,
  })

/** The four providers in memory: each answers in its own shape. */
function providers(options: { mention?: boolean; status?: Record<string, number> } = {}) {
  const calls: AskRequest[] = []
  const text = options.mention === true ? 'أنصح بموقع قهوة الواحة.' : 'أنصح بمواقع أخرى.'
  const urls =
    options.mention === true
      ? ['https://www.alwaha.com.sa/shop', 'https://other.com/x']
      : ['https://other.com/x', 'https://rival.net/y']
  const ask: Ask = (request) => {
    calls.push(request)
    const host = new URL(request.url).hostname
    const status = options.status?.[host] ?? 200
    if (status !== 200) return Promise.resolve({ status, body: encode({ error: 'no' }) })
    if (host === 'api.openai.com') {
      return Promise.resolve({
        status,
        body: encode({
          output: [
            { type: 'web_search_call', status: 'completed' },
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text,
                  annotations: urls.map((url) => ({ type: 'url_citation', url, title: 't' })),
                },
              ],
            },
          ],
        }),
      })
    }
    if (host === 'generativelanguage.googleapis.com') {
      return Promise.resolve({
        status,
        body: encode({
          output_text: text,
          execution_steps: [
            {
              type: 'model_output',
              content: [
                {
                  type: 'text',
                  text,
                  annotations: urls.map((url) => ({ type: 'url_citation', url })),
                },
              ],
            },
          ],
        }),
      })
    }
    if (host === 'api.perplexity.ai') {
      return Promise.resolve({
        status,
        body: encode({
          output: [
            { type: 'message', content: [{ type: 'output_text', text, annotations: [] }] },
            { type: 'search_results', results: urls.map((url) => ({ url, title: 't' })) },
          ],
        }),
      })
    }
    return Promise.resolve({
      status,
      body: encode({
        content: [
          { type: 'server_tool_use', name: 'web_search', input: { query: 'q' } },
          {
            type: 'web_search_tool_result',
            content: urls.map((url) => ({ type: 'web_search_result', url, title: 't' })),
          },
          {
            type: 'text',
            text,
            citations: urls.map((url) => ({ type: 'web_search_result_location', url, title: 't' })),
          },
        ],
      }),
    })
  }
  return { ask, calls }
}

const KEYS = { openai: 'o', gemini: 'g', perplexity: 'p', anthropic: 'a' }

beforeEach(() => {
  clearAiCache()
})

describe('the questions', () => {
  it('are in Arabic, from the h1 and the brand, at most five', () => {
    const { brand, topic, questions } = questionsFor(pageOf())
    expect(brand).toBe('قهوة الواحة')
    expect(topic).toBe('قهوة مختصة محمصة')
    expect(questions.length).toBeGreaterThanOrEqual(3)
    expect(questions.length).toBeLessThanOrEqual(5)
    expect(questions.every((question) => /\p{Script=Arabic}/u.test(question))).toBe(true)
    expect(questions.some((question) => question.includes('قهوة الواحة'))).toBe(true)
    expect(questionsFor(pageOf(), 3).questions).toHaveLength(3)
  })
})

describe('reading the four providers', () => {
  it('reads text and sources from each shape', () => {
    const calls = providers({ mention: true })
    return Promise.all(
      (['openai', 'gemini', 'perplexity', 'anthropic'] as const).map(async (id) => {
        const request = ADAPTERS[id].request('سؤال', 'key', 'model')
        const response = await calls.ask({ ...request })
        const parsed = ADAPTERS[id].parse(JSON.parse(new TextDecoder().decode(response?.body)))
        expect(parsed.text).toContain('قهوة الواحة')
        expect(parsed.urls).toContain('https://www.alwaha.com.sa/shop')
      }),
    )
  })

  it('puts the key in a header and never in the address, with the answer capped', () => {
    for (const id of ['openai', 'gemini', 'perplexity', 'anthropic'] as const) {
      const request = ADAPTERS[id].request('سؤال', 'SECRET', 'model')
      expect(request.url).not.toContain('SECRET')
      expect(JSON.stringify(request.headers)).toContain('SECRET')
      expect(request.url.startsWith('https://')).toBe(true)
    }
    expect(JSON.stringify(ADAPTERS.openai.request('س', 'k', 'm').json)).toContain(
      String(MAX_ANSWER_TOKENS),
    )
    expect(JSON.stringify(ADAPTERS.anthropic.request('س', 'k', 'm').json)).toContain('"max_uses":2')
  })

  it('judges an answer by the brand’s name, its domain and the sources', () => {
    const targets = { brandKeys: ['قهوهالواحه'], domain: 'alwaha.com.sa' }
    expect(judgeAnswer({ text: 'جرّب قهوة الواحة', urls: [] }, targets)).toMatchObject({
      mentioned: true,
      cited: false,
    })
    expect(
      judgeAnswer(
        { text: 'x', urls: ['https://shop.alwaha.com.sa/p', 'https://rival.net/'] },
        targets,
      ),
    ).toMatchObject({
      mentioned: true,
      cited: true,
      competitors: ['rival.net'],
    })
    expect(judgeAnswer({ text: 'لا شيء', urls: ['https://rival.net/'] }, targets)).toMatchObject({
      mentioned: false,
      cited: false,
    })
  })
})

describe('asking the assistants', () => {
  it('asks each provider with a key, within the cap, and keeps no answer text', async () => {
    const { ask, calls } = providers({ mention: true })
    const facts = await askAssistants(pageOf(), {
      ask,
      options: { keys: KEYS },
      hostname: 'www.alwaha.com.sa',
    })
    expect(facts.outcome).toBe('checked')
    if (facts.outcome !== 'checked') return
    expect(calls.length).toBeLessThanOrEqual(MAX_CALLS)
    expect(calls).toHaveLength(facts.questions.length * 4)
    expect(facts.providers.map((provider) => provider.provider)).toEqual([
      'openai',
      'gemini',
      'perplexity',
      'anthropic',
    ])
    for (const provider of facts.providers) {
      expect(provider.status).toBe('ok')
      expect(provider.answers.every((answer) => answer.mentioned && answer.cited)).toBe(true)
    }
    expect(JSON.stringify(facts)).not.toContain('أنصح')
    // A rescan within the day makes no request.
    const second = providers({ mention: true })
    await askAssistants(pageOf(), {
      ask: second.ask,
      options: { keys: KEYS },
      hostname: 'www.alwaha.com.sa',
    })
    expect(second.calls).toHaveLength(0)
  })

  it('asks only the providers that have a key', async () => {
    const { ask, calls } = providers()
    const facts = await askAssistants(pageOf(), {
      ask,
      options: { keys: { anthropic: 'a' }, maxQuestions: 3 },
      hostname: 'www.alwaha.com.sa',
    })
    expect(calls).toHaveLength(3)
    expect(new Set(calls.map((call) => new URL(call.url).hostname))).toEqual(
      new Set(['api.anthropic.com']),
    )
    expect(
      facts.outcome === 'checked' && facts.providers.map((provider) => provider.provider),
    ).toEqual(['anthropic'])
    if (facts.outcome === 'checked') {
      expect(facts.providers[0]?.answers.every((answer) => !answer.mentioned)).toBe(true)
      expect(facts.providers[0]?.answers[0]?.competitors).toEqual(['other.com', 'rival.net'])
    }
  })

  it('says a refused key is refused, and stops asking that provider', async () => {
    const { ask, calls } = providers({ status: { 'api.openai.com': 401 } })
    const facts = await askAssistants(pageOf(), {
      ask,
      options: { keys: { openai: 'bad' } },
      hostname: 'www.alwaha.com.sa',
    })
    expect(facts).toEqual({
      outcome: 'failed',
      statuses: [{ provider: 'openai', status: 'refused' }],
    })
    expect(calls.length).toBeLessThan(5)
  })

  it('keeps what a working provider said when another is refused', async () => {
    const { ask } = providers({ mention: true, status: { 'api.perplexity.ai': 429 } })
    const facts = await askAssistants(pageOf(), {
      ask,
      options: { keys: KEYS },
      hostname: 'www.alwaha.com.sa',
    })
    if (facts.outcome !== 'checked') throw new Error('expected checked')
    expect(facts.providers.find((provider) => provider.provider === 'perplexity')?.status).toBe(
      'limited',
    )
    expect(facts.providers.find((provider) => provider.provider === 'openai')?.status).toBe('ok')
  })
})

describe('the AI visibility tool in a scan', () => {
  let site: TempSite | undefined
  afterEach(async () => {
    await site?.close()
    site = undefined
  })

  it('is off without a key: a notice, nothing sent', async () => {
    site = await tempSite({ 'index.html': source })
    const { ask, calls } = providers()
    const report = await scan(site.url('/'), {
      ruleIds: ['ai-visibility-gap'],
      policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
      outside: { ask },
    })
    expect(report.scan.notices.map((notice) => notice.code)).toContain('ai-visibility-off')
    expect(report.rules.find((rule) => rule.id === 'ai-visibility-gap')?.status).toBe(
      'not-applicable',
    )
    expect(report.facts.aiVisibility).toBeUndefined()
    expect(calls).toHaveLength(0)
  })
})

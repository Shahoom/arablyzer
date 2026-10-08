import type {
  AiVisibilityFacts,
  CruxCountriesFacts,
  LookalikeFacts,
  OutsideFacts,
  PageFacts,
  PdfFacts,
  SuggestFacts,
} from '@arablyzer/collectors'
import { type SafeFetchOptions } from '@arablyzer/egress'
import type { Notice } from '@arablyzer/report-schema'
import type { Facts } from '@arablyzer/report-schema'
import { isMostlyArabic, type Rule } from '@arablyzer/rules'
import { CT_TOTAL_MS, DNS_TOTAL_MS, findLookalikes, generateLookalikes } from './lookalikes'
import { notice } from './notices'
import { askVia, type Ask } from './outside-http'
import { checkPdfs, PDFS_TOTAL_MS } from './pdfs'
import type { PdfExtract } from './pdf-read'
import { AI_TOTAL_MS, askAssistants, PROVIDERS, type AiVisibilityOptions } from './ai-visibility'
import { httpClient, type BigQueryClient, type BigQueryCredentials } from './bigquery'
import { DEFAULT_MAX_BYTES, queryCruxCountries } from './crux-countries'
import { askSuggest, SUGGEST_TOTAL_MS, type SuggestOptions } from './suggest'
import { budget } from './timeout'

/**
 * What a scan may ask of services other than the scanned site (docs/design/plans/arabic-native.md
 * §9 to §14). Nothing here is asked in a whole scan: only a scan that names a rule needing it.
 */
export interface OutsideOptions {
  /**
   * How the requests are made; safeFetch under the scan's policy, as ArablyzerBot, by default.
   * Tests give a stand-in so that no service is ever called.
   */
  readonly ask?: Ask
  /**
   * Google's public suggest endpoint, for the misspellings tool: present only when the operator
   * switched it on (ARABLYZER_SUGGEST=1). Without it the rule does not apply and a notice says why.
   */
  readonly suggest?: SuggestOptions
  /**
   * The AI assistants' keys, for the AI visibility tool: present only when the operator gave at least
   * one. Without it the rule does not apply and a notice says so; nothing is ever sent.
   */
  readonly aiVisibility?: AiVisibilityOptions
  /**
   * BigQuery, for the per-country Chrome UX tool: a service account's key and the project that
   * pays for the queries. Without it the rule does not apply and a notice says so; nothing is sent.
   */
  readonly cruxCountries?: {
    readonly credentials: BigQueryCredentials
    readonly project: string
    /** Bytes billed at most for one scan; DEFAULT_MAX_BYTES (20 GiB). */
    readonly maxBytes?: number
    /** Another client; tests give a stand-in. */
    readonly client?: BigQueryClient
  }
  /** Makes the pauses short, and fixes "now"; tests only. */
  readonly test?: {
    readonly now?: () => number
    readonly ctEndpoint?: string
    readonly ctGapMs?: number
    readonly dnsGapMs?: number
    readonly suggestGapMs?: number
    /** Reads a PDF without the thread. */
    readonly read?: (data: Uint8Array) => Promise<PdfExtract | null>
  }
}

export interface OutsideContext {
  readonly rules: readonly Rule[]
  /** The scanned page. */
  readonly page: PageFacts
  /** The scanned page's host. */
  readonly hostname: string
  /** The page was reached (not a challenge, no failure). */
  readonly reached: boolean
  /** The page is on a private address (a local test site). */
  readonly privateAccess: boolean
  /** The scan's fetch options, with the policy to use for public services. */
  readonly base: SafeFetchOptions
  /** The fetch options for the scanned site's own files (its policy keeps a public site off private addresses). */
  readonly siteBase: SafeFetchOptions
  /** Whether the site's robots.txt (that of the file's own host) lets the bot fetch a URL. */
  readonly allowed: (url: string) => Promise<boolean>
  readonly options: OutsideOptions | undefined
  /** The DoH resolver of the scan (ScanOptions.dohUrl). */
  readonly dohUrl: string | undefined
  readonly signal: AbortSignal | undefined
}

export interface OutsideRun {
  readonly collected: OutsideFacts
  readonly notices: Notice[]
}

const needs = (rules: readonly Rule[], need: Rule['needs'][number]) =>
  rules.some((rule) => rule.needs.includes(need))

/** Asks the services the scan's rules need, one after another; the page's own scan is over. */
export async function runOutside(context: OutsideContext): Promise<OutsideRun> {
  const { rules, options } = context
  const ask = options?.ask ?? askVia(context.base)
  const notices: Notice[] = []
  let lookalikes: LookalikeFacts | undefined
  if (
    needs(rules, 'lookalikes') &&
    context.reached &&
    !context.privateAccess &&
    generateLookalikes(context.hostname).length > 0
  ) {
    const limit = budget(DNS_TOTAL_MS + CT_TOTAL_MS, context.signal)
    try {
      lookalikes = await findLookalikes(context.hostname, {
        ask,
        ...(context.dohUrl === undefined ? {} : { dohUrl: context.dohUrl }),
        signal: limit.signal,
        ...(options?.test ?? {}),
      })
    } finally {
      limit.stop()
    }
    if (lookalikes.outcome === 'failed') notices.push(notice('lookalikes-failed'))
    else if (lookalikes.ct !== 'checked') notices.push(notice('lookalikes-ct'))
  }
  let pdfs: PdfFacts | undefined
  if (needs(rules, 'pdfs') && context.reached && context.page.html !== null) {
    const limit = budget(PDFS_TOTAL_MS, context.signal)
    try {
      pdfs = await checkPdfs(context.page, {
        ask: options?.ask ?? askVia(context.siteBase),
        allowed: context.allowed,
        arabicPage: isMostlyArabic(context.page),
        signal: limit.signal,
        ...(options?.test?.read === undefined ? {} : { read: options.test.read }),
      })
    } finally {
      limit.stop()
    }
    if (pdfs.linked === 0) notices.push(notice('pdfs-none'))
    else if (pdfs.files.some((file) => file.outcome !== 'read')) {
      notices.push(notice('pdfs-unread'))
    }
  }
  let suggest: SuggestFacts | undefined
  if (needs(rules, 'suggest') && context.reached && context.page.html !== null) {
    if (options?.suggest === undefined) notices.push(notice('suggest-off'))
    else {
      const limit = budget(SUGGEST_TOTAL_MS, context.signal)
      try {
        suggest = await askSuggest(context.page, {
          ask,
          options: options.suggest,
          signal: limit.signal,
          ...(options.test?.suggestGapMs === undefined ? {} : { gapMs: options.test.suggestGapMs }),
        })
      } finally {
        limit.stop()
      }
      if (suggest.outcome === 'no-terms') notices.push(notice('suggest-no-terms'))
      else if (suggest.outcome === 'failed') notices.push(notice('suggest-failed'))
      else if (suggest.stopped) notices.push(notice('suggest-stopped'))
    }
  }
  let aiVisibility: AiVisibilityFacts | undefined
  if (needs(rules, 'ai-visibility') && context.reached) {
    const keys = options?.aiVisibility?.keys ?? {}
    if (options?.aiVisibility === undefined || PROVIDERS.every((id) => (keys[id] ?? '') === '')) {
      notices.push(notice('ai-visibility-off'))
    } else if (!context.privateAccess) {
      const limit = budget(AI_TOTAL_MS, context.signal)
      try {
        aiVisibility = await askAssistants(context.page, {
          ask,
          options: options.aiVisibility,
          hostname: context.hostname,
          signal: limit.signal,
        })
      } finally {
        limit.stop()
      }
      if (aiVisibility.outcome === 'no-questions')
        notices.push(notice('ai-visibility-no-questions'))
      else if (aiVisibility.outcome === 'failed') {
        const refused = aiVisibility.statuses.filter((item) => item.status === 'refused')
        notices.push(
          refused.length > 0
            ? notice('ai-visibility-refused', {
                providers: refused.map((item) => item.provider).join(', '),
              })
            : notice('ai-visibility-failed'),
        )
      } else {
        const trouble = aiVisibility.providers.filter((item) => item.status !== 'ok')
        if (trouble.length > 0) {
          notices.push(
            notice('ai-visibility-provider', {
              providers: trouble.map((item) => `${item.provider} (${item.status})`).join(', '),
            }),
          )
        }
      }
    }
  }
  let cruxCountries: CruxCountriesFacts | undefined
  if (needs(rules, 'crux-countries') && context.reached) {
    const config = options?.cruxCountries
    if (config === undefined) notices.push(notice('crux-countries-off'))
    else if (!context.privateAccess) {
      const limit = budget(120_000, context.signal)
      try {
        cruxCountries = await queryCruxCountries({
          origin: new URL(context.page.url).origin,
          options: {
            client:
              config.client ??
              httpClient({
                ask,
                credentials: config.credentials,
                project: config.project,
                signal: limit.signal,
              }),
            maxBytes: config.maxBytes ?? DEFAULT_MAX_BYTES,
          },
        })
      } finally {
        limit.stop()
      }
      if (cruxCountries.outcome === 'failed') notices.push(notice('crux-countries-failed'))
      else if (cruxCountries.outcome === 'too-big') {
        notices.push(
          notice('crux-countries-too-big', {
            bytes: String(Math.round(cruxCountries.bytes / 1024 ** 3)),
            cap: String(Math.round(cruxCountries.cap / 1024 ** 3)),
          }),
        )
      }
    }
  }
  return {
    collected: {
      ...(lookalikes === undefined ? {} : { lookalikes }),
      ...(pdfs === undefined ? {} : { pdfs }),
      ...(suggest === undefined ? {} : { suggest }),
      ...(aiVisibility === undefined ? {} : { aiVisibility }),
      ...(cruxCountries === undefined ? {} : { cruxCountries }),
    },
    notices,
  }
}

/** The report's facts for what was collected; none where a service was not asked or failed. */
export function outsideFacts(collected: OutsideFacts, rules: readonly Rule[]): Facts {
  const facts: Facts = {}
  const { lookalikes } = collected
  if (
    lookalikes?.outcome === 'checked' &&
    rules.some((rule) => rule.needs.includes('lookalikes'))
  ) {
    facts.lookalikes = {
      domain: lookalikes.domain,
      candidates: lookalikes.candidates,
      asked: lookalikes.asked,
      ct: lookalikes.ct,
      found: lookalikes.found.map((item) => ({ ...item })),
    }
  }
  const { pdfs } = collected
  if (pdfs !== undefined && rules.some((rule) => rule.needs.includes('pdfs'))) {
    facts.pdfs = {
      linked: pdfs.linked,
      files: pdfs.files.map((file) => ({
        ...file,
        issues: file.issues.map((issue) => ({ ...issue })),
      })),
    }
  }
  const { suggest } = collected
  if (suggest?.outcome === 'checked' && rules.some((rule) => rule.needs.includes('suggest'))) {
    facts.suggest = {
      calls: suggest.calls,
      stopped: suggest.stopped,
      terms: suggest.terms.map((term) => ({
        term: term.term,
        written: term.written,
        variants: term.variants.map((variant) => ({ ...variant })),
      })),
    }
  }
  const { aiVisibility } = collected
  if (
    aiVisibility?.outcome === 'checked' &&
    rules.some((rule) => rule.needs.includes('ai-visibility'))
  ) {
    facts.aiVisibility = {
      brand: aiVisibility.brand,
      domain: aiVisibility.domain,
      questions: [...aiVisibility.questions],
      calls: aiVisibility.calls,
      providers: aiVisibility.providers.map((provider) => ({
        ...provider,
        answers: provider.answers.map((answer) => ({
          ...answer,
          citations: [...answer.citations],
          competitors: [...answer.competitors],
        })),
      })),
    }
  }
  const { cruxCountries } = collected
  if (
    cruxCountries?.outcome === 'checked' &&
    rules.some((rule) => rule.needs.includes('crux-countries'))
  ) {
    facts.cruxCountries = {
      origin: cruxCountries.origin,
      month: cruxCountries.month,
      bytes: cruxCountries.bytes,
      countries: cruxCountries.countries.map((country) => ({
        ...country,
        good: { ...country.good },
      })),
    }
  }
  return facts
}

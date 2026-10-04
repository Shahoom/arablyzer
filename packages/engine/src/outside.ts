import type { LookalikeFacts, OutsideFacts, PageFacts, PdfFacts } from '@arablyzer/collectors'
import { type SafeFetchOptions } from '@arablyzer/egress'
import type { Notice } from '@arablyzer/report-schema'
import type { Facts } from '@arablyzer/report-schema'
import { isMostlyArabic, type Rule } from '@arablyzer/rules'
import { CT_TOTAL_MS, DNS_TOTAL_MS, findLookalikes, generateLookalikes } from './lookalikes'
import { notice } from './notices'
import { askVia, type Ask } from './outside-http'
import { checkPdfs, PDFS_TOTAL_MS } from './pdfs'
import type { PdfExtract } from './pdf-read'
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
  /** Makes the pauses short, and fixes "now"; tests only. */
  readonly test?: {
    readonly now?: () => number
    readonly ctEndpoint?: string
    readonly ctGapMs?: number
    readonly dnsGapMs?: number
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
  return {
    collected: {
      ...(lookalikes === undefined ? {} : { lookalikes }),
      ...(pdfs === undefined ? {} : { pdfs }),
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
  return facts
}

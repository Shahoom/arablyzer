import {
  KEYWORD_SCRIPTS,
  OPPORTUNITY_MIN_IMPRESSIONS,
  OPPORTUNITY_POSITIONS,
  type GscKeywordsResult,
  type GscRow,
  type GscScriptShare,
  type GscVariantGroup,
  type KeywordScript,
} from '@arablyzer/api-contract/codes'
import type { GoogleApi } from './google'
import { periodOf, pickProperty, shapeRows, shapeTotals } from './shape'

/** How many queries one request asks Google for (its answer stays well under the size cap). */
export const QUERY_ROWS = 1000
const TOP = 50
const OPPORTUNITIES = 50
const VARIANT_GROUPS = 10
const SPELLINGS = 4

/**
 * The address the visitor typed, as the site it names: `https://<host>/`, which is only ever
 * compared with the visitor's own Search Console properties, never fetched. A scheme, a path, a
 * port-less `www.` and an `sc-domain:` prefix are accepted and dropped; an address, a name with
 * no dot, or anything that is not a host name is null.
 */
export function siteUrlOf(input: string): string | null {
  const typed = input
    .trim()
    .replace(/^sc-domain:/i, '')
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  const host = typed.split(/[/?#]/, 1)[0] ?? ''
  if (host === '' || host.includes('@') || host.includes(':') || host.length > 253) return null
  let name: string
  try {
    name = new URL(`https://${host}/`).hostname.replace(/\.$/, '')
  } catch {
    return null
  }
  // An IPv4 address has digits for a last label, which the check below refuses.
  if (!name.includes('.')) return null
  const labels = name.split('.')
  const wellFormed = labels.every((label) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  return wellFormed && /^[a-z]{2,}$|^xn--[a-z0-9-]+$/.test(labels.at(-1) ?? '')
    ? `https://${name}/`
    : null
}

// Zero-width and direction marks, written as escapes so that they can be seen.
const INVISIBLE = new RegExp('[\\u200B-\\u200F\\u202A-\\u202E\\u2060\\uFEFF]', 'g')
const ARABIC_LETTER = /(?=\p{L})\p{Script=Arabic}/u
const LATIN_LETTER = /(?=\p{L})\p{Script=Latin}/u

/** What a query is written in, by its letters (digits and signs do not count). */
export function scriptOfQuery(query: string): KeywordScript {
  const arabic = ARABIC_LETTER.test(query)
  const latin = LATIN_LETTER.test(query)
  return arabic && latin ? 'mixed' : arabic ? 'arabic' : latin ? 'latin' : 'other'
}

/**
 * A query's spelling folded as readers and search engines fold it: alef with hamza or madda to
 * alef, alef maqsura to ya, ta marbuta to ha, hamza on waw and ya, the marks and the tatweel
 * dropped, Arabic-Indic digits to Latin, case and spacing. Two queries with one key are one word
 * written two ways.
 */
export function spellingKey(query: string): string {
  return query
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/[ىئی]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ک/g, 'ك')
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const empty = (): GscScriptShare => ({ queries: 0, clicks: 0, impressions: 0 })

/** The queries' insights from Google's rows (shapeRows already dropped what is not a number). */
export function analyseQueries(rows: readonly GscRow[]): {
  top: GscRow[]
  opportunities: GscRow[]
  scripts: Record<KeywordScript, GscScriptShare>
  variants: GscVariantGroup[]
} {
  const scripts = Object.fromEntries(KEYWORD_SCRIPTS.map((s) => [s, empty()])) as Record<
    KeywordScript,
    GscScriptShare
  >
  const groups = new Map<string, GscRow[]>()
  for (const row of rows) {
    const script = scriptOfQuery(row.key)
    const share = scripts[script]
    scripts[script] = {
      queries: share.queries + 1,
      clicks: share.clicks + row.clicks,
      impressions: share.impressions + row.impressions,
    }
    if (script === 'arabic' || script === 'mixed') {
      const key = spellingKey(row.key)
      groups.set(key, [...(groups.get(key) ?? []), row])
    }
  }
  const opportunities = rows
    .filter(
      (row) =>
        row.position >= OPPORTUNITY_POSITIONS.from &&
        row.position <= OPPORTUNITY_POSITIONS.to &&
        row.impressions >= OPPORTUNITY_MIN_IMPRESSIONS,
    )
    .sort((a, b) => b.impressions - a.impressions || a.position - b.position)
    .slice(0, OPPORTUNITIES)
  const variants = [...groups.values()]
    .filter((group) => new Set(group.map((row) => row.key)).size >= 2)
    .map((group): GscVariantGroup => {
      const spellings = [...group].sort((a, b) => b.impressions - a.impressions)
      return {
        clicks: spellings.reduce((sum, row) => sum + row.clicks, 0),
        impressions: spellings.reduce((sum, row) => sum + row.impressions, 0),
        spellings: spellings.slice(0, SPELLINGS),
      }
    })
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, VARIANT_GROUPS)
  return { top: rows.slice(0, TOP), opportunities, scripts, variants }
}

/**
 * Reads Search Console for the site the visitor typed with the token: their properties, the one
 * the site matches, and for it the totals and up to 1,000 queries of the 28 days. A site they own
 * no property for is a result with none; nothing at all, or no list of properties, is a failure.
 */
export async function collectKeywords(
  google: GoogleApi,
  token: string,
  siteUrl: string,
  now: Date,
): Promise<GscKeywordsResult | null> {
  const period = periodOf(now)
  const sites = await google.sites(token)
  if (sites.status !== 200) return null
  const property = pickProperty(sites.body, siteUrl)
  const none = {
    analysed: 0,
    truncated: false,
    top: [],
    opportunities: [],
    scripts: Object.fromEntries(KEYWORD_SCRIPTS.map((s) => [s, empty()])) as Record<
      KeywordScript,
      GscScriptShare
    >,
    variants: [],
  }
  if (property === null) {
    return { property: null, period, totals: null, ...none, partial: false }
  }
  const ask = (dimensions: string[], rowLimit: number) =>
    google.analytics(token, property.siteUrl, {
      startDate: period.start,
      endDate: period.end,
      ...(dimensions.length === 0 ? {} : { dimensions }),
      rowLimit,
    })
  const [totals, queries] = await Promise.all([ask([], 1), ask(['query'], QUERY_ROWS)])
  if (totals.status !== 200 && queries.status !== 200) return null
  const rows = queries.status === 200 ? shapeRows(queries.body, QUERY_ROWS) : []
  return {
    property,
    period,
    totals: totals.status === 200 ? shapeTotals(totals.body) : null,
    analysed: rows.length,
    truncated: rows.length >= QUERY_ROWS,
    ...analyseQueries(rows),
    partial: totals.status !== 200 || queries.status !== 200,
  }
}

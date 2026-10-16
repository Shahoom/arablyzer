/**
 * What the sample frame leaves out of the Arab country domains
 * (docs/design/plans/m9-state-of-arabic-web.md §2). A country-code domain is not always the
 * country's web: some ccTLDs are sold to the world as «domain hacks» (`bit.ly`, `lu.ma`), and a
 * global company keeps a mirror on each country's domain (`google.iq`, `youtube.co.ma`). Both are
 * real sites on real Arab domains and neither says anything about the Arabic web, so they are left
 * out of the frame before sampling, and each one is recorded with its reason in the frame's
 * `<list id>.exclusions.csv`. The lists below are the whole rule: changing one changes the frame.
 */

export type ExclusionReason = 'global-brand' | 'ly-single-label' | 'vanity-domain'

export const EXCLUSION_REASONS: readonly ExclusionReason[] = [
  'global-brand',
  'ly-single-label',
  'vanity-domain',
]

/**
 * `.ly` is the one Arab ccTLD whose single-label names (`bit.ly`, `cutt.ly`, `musical.ly`) are
 * sold worldwide as word endings, so a name directly under `.ly` is not taken for a Libyan site.
 * What Libya itself registers sits under these second-level public suffixes (`cbl.gov.ly`,
 * `uot.edu.ly`), and only those are kept.
 */
export const LY_SECOND_LEVEL: readonly string[] = [
  'gov',
  'com',
  'edu',
  'org',
  'net',
  'sch',
  'plc',
  'med',
  'id',
]

/**
 * Domain hacks on the other Arab ccTLDs, named one by one: `.ma` and the rest are Morocco's and
 * the others' own in nearly every name, so no rule of shape can tell `lu.ma` (an events service)
 * from `avito.ma`. Add a name here when a frame shows one; the rest of the list is not touched.
 */
export const VANITY_DOMAINS: ReadonlySet<string> = new Set(['lu.ma', 'cre.ma'])

/**
 * Global brands whose country mirrors are not the Arabic web: the name as it is written in the
 * domain's first label, on a country domain (`google.iq`) or under a generic second level
 * (`google.co.ma`, `youtube.com.sa`).
 */
export const GLOBAL_BRANDS: ReadonlySet<string> = new Set([
  'google',
  'youtube',
  'facebook',
  'instagram',
  'amazon',
  'microsoft',
  'apple',
  'wikipedia',
  'yahoo',
  'bing',
  'twitter',
  'x',
  'tiktok',
  'linkedin',
  'whatsapp',
  'netflix',
  'booking',
])

/** The second levels a brand's country mirror may sit under: `google.co.ma`, `google.com.sa`. */
const MIRROR_SECOND_LEVEL: ReadonlySet<string> = new Set(['com', 'co', 'net', 'org'])

/**
 * Why a domain (already lower case, on one of the frame's country domains) is not a site of the
 * Arabic web, or null when it is kept. A brand's mirror is named first, then `.ly`'s single names,
 * then the named hacks, so a domain that is two of them gets the most specific reason.
 */
export function exclusionOf(domain: string): ExclusionReason | null {
  const labels = domain.split('.')
  const tld = labels.at(-1)
  const rest = labels.slice(0, -1)
  const first = rest[0]
  if (
    first !== undefined &&
    GLOBAL_BRANDS.has(first) &&
    (rest.length === 1 || (rest.length === 2 && MIRROR_SECOND_LEVEL.has(rest[1] ?? '')))
  ) {
    return 'global-brand'
  }
  if (tld === 'ly' && !(rest.length >= 2 && LY_SECOND_LEVEL.includes(rest.at(-1) ?? ''))) {
    return 'ly-single-label'
  }
  return VANITY_DOMAINS.has(domain) ? 'vanity-domain' : null
}

/** A site left out of the frame, with its place in the list and why. */
export interface ExcludedRow {
  readonly domain: string
  readonly rank: number
  readonly country: string
  readonly reason: ExclusionReason
}

export const EXCLUSIONS_HEADER = 'domain,rank,country,reason'

export function exclusionsCsv(rows: readonly ExcludedRow[]): string {
  return `${EXCLUSIONS_HEADER}\n${rows.map((r) => `${r.domain},${String(r.rank)},${r.country},${r.reason}`).join('\n')}${rows.length === 0 ? '' : '\n'}`
}

export function parseExclusionsCsv(text: string): ExcludedRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines[0]?.trim() !== EXCLUSIONS_HEADER) {
    throw new Error(`The exclusions' header is ${EXCLUSIONS_HEADER}`)
  }
  return lines.slice(1).map((line, index) => {
    const [domain, rank, country, reason, ...more] = line.split(',')
    const place = Number(rank)
    if (
      more.length > 0 ||
      domain === undefined ||
      country === undefined ||
      !Number.isInteger(place) ||
      place < 1 ||
      !EXCLUSION_REASONS.includes(reason as ExclusionReason) ||
      exclusionOf(domain) !== reason
    ) {
      throw new Error(`Line ${String(index + 2)} of the exclusions is not one of them`)
    }
    return { domain, rank: place, country, reason }
  })
}

/** How many sites each reason left out. */
export function countByReason(rows: readonly ExcludedRow[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const reason of EXCLUSION_REASONS) {
    const n = rows.filter((row) => row.reason === reason).length
    if (n > 0) counts[reason] = n
  }
  return counts
}

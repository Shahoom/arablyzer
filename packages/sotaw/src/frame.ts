import { COUNTRY_CODES, countryOfDomain } from './countries'
import { byHash } from './rng'

/** One site of the sample frame: all that the committed file holds of it. */
export interface FrameRow {
  readonly domain: string
  /** Its place in the Tranco list. */
  readonly rank: number
  /** The country code of its domain (countries.ts). */
  readonly country: string
}

export interface TrancoEntry {
  readonly rank: number
  readonly domain: string
}

/** A host name as the list writes it: lower case, ASCII (an internationalised name is Punycode). */
const HOSTNAME = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/

/** A domain name as the frame keeps it, or null when it is not one a site is served from. */
export function normalizeDomain(raw: string): string | null {
  const domain = raw.trim().toLowerCase().replace(/\.$/, '')
  return HOSTNAME.test(domain) ? domain : null
}

/**
 * Tranco's file: `rank,domain` on each line, no header. A line that is not that is counted and
 * left out; the caller says how many, so a file that is not the list is noticed.
 */
export function parseTranco(text: string): { entries: TrancoEntry[]; invalid: number } {
  const entries: TrancoEntry[] = []
  let invalid = 0
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue
    const comma = line.indexOf(',')
    const rank = comma > 0 ? Number(line.slice(0, comma)) : Number.NaN
    const domain = comma > 0 ? normalizeDomain(line.slice(comma + 1)) : null
    if (!Number.isInteger(rank) || rank < 1 || domain === null) invalid++
    else entries.push({ rank, domain })
  }
  return { entries, invalid }
}

/** The domains whose owners asked to be left out: a name a line, `#` for a comment. */
export function parseOptOut(text: string): ReadonlySet<string> {
  const names = new Set<string>()
  for (const line of text.split(/\r?\n/)) {
    const name = normalizeDomain(line.replace(/#.*/, ''))
    if (name !== null) names.add(name.replace(/^www\./, ''))
  }
  return names
}

export const isOptedOut = (domain: string, optOut: ReadonlySet<string>): boolean =>
  optOut.has(domain.replace(/^www\./, ''))

/**
 * How many sites each country gets when the cap is lower than the list: every country its floor (or
 * all it has), the rest by the size of what each has left, whole numbers by largest remainder. A
 * cap above the list gives every site.
 */
export function allocate(
  populations: Readonly<Record<string, number>>,
  cap: number,
  floor: number,
): Record<string, number> {
  const codes = Object.keys(populations).sort()
  const total = codes.reduce((sum, code) => sum + (populations[code] ?? 0), 0)
  const result: Record<string, number> = {}
  if (total <= cap) {
    for (const code of codes) result[code] = populations[code] ?? 0
    return result
  }
  const base: Record<string, number> = {}
  let used = 0
  for (const code of codes) {
    base[code] = Math.min(populations[code] ?? 0, floor)
    used += base[code]
  }
  // Largest remainder: `share` is what each is owed of `amount`, `room` what each may still take.
  const share = (
    amount: number,
    weight: Readonly<Record<string, number>>,
    room: Readonly<Record<string, number>>,
  ): Record<string, number> => {
    const weights = codes.reduce((sum, code) => sum + (weight[code] ?? 0), 0)
    const whole: Record<string, number> = {}
    const remainders: { code: string; fraction: number }[] = []
    let given = 0
    for (const code of codes) {
      const exact = weights === 0 ? 0 : (amount * (weight[code] ?? 0)) / weights
      whole[code] = Math.min(Math.floor(exact), room[code] ?? 0)
      given += whole[code]
      remainders.push({ code, fraction: exact - Math.floor(exact) })
    }
    remainders.sort((a, b) => b.fraction - a.fraction || (a.code < b.code ? -1 : 1))
    for (const { code } of remainders) {
      if (given >= amount) break
      if ((whole[code] ?? 0) < (room[code] ?? 0)) {
        whole[code] = (whole[code] ?? 0) + 1
        given++
      }
    }
    return whole
  }
  if (used >= cap) {
    // The floors alone fill the cap: they are cut in proportion.
    const cut = share(cap, base, base)
    for (const code of codes) result[code] = cut[code] ?? 0
    return result
  }
  const room: Record<string, number> = {}
  for (const code of codes) room[code] = (populations[code] ?? 0) - (base[code] ?? 0)
  const more = share(cap - used, room, room)
  for (const code of codes) result[code] = (base[code] ?? 0) + (more[code] ?? 0)
  return result
}

export interface FrameOptions {
  /** The most sites in the frame. */
  readonly cap: number
  /** The fewest sites a country is given when it has them, so that a small country can be read. */
  readonly floor: number
  /** Published with the frame: the same list and seed give the same sites. */
  readonly seed: string
  readonly optOut?: ReadonlySet<string>
}

export interface Frame {
  readonly rows: readonly FrameRow[]
  /** The sites of each country in the list, before sampling (and after opt-outs). */
  readonly populations: Readonly<Record<string, number>>
  /** The sites of each country in the frame. */
  readonly sampled: Readonly<Record<string, number>>
  /** The sites left out at their owners' request. */
  readonly optedOut: number
}

/**
 * The sample frame: the list's sites on an Arab country domain, sampled when there are more than
 * the cap. A country's sites are taken by the smallest hash of (seed, domain), so the choice is
 * random with respect to rank and repeatable.
 */
export function buildFrame(entries: readonly TrancoEntry[], options: FrameOptions): Frame {
  const optOut = options.optOut ?? new Set<string>()
  const byCountry = new Map<string, FrameRow[]>()
  const seen = new Set<string>()
  let optedOut = 0
  for (const { rank, domain } of entries) {
    const country = countryOfDomain(domain)
    if (country === null || seen.has(domain)) continue
    seen.add(domain)
    if (isOptedOut(domain, optOut)) {
      optedOut++
      continue
    }
    const list = byCountry.get(country) ?? []
    list.push({ domain, rank, country })
    byCountry.set(country, list)
  }
  const populations: Record<string, number> = {}
  for (const code of COUNTRY_CODES) populations[code] = byCountry.get(code)?.length ?? 0
  const quota = allocate(populations, options.cap, options.floor)
  const rows: FrameRow[] = []
  const sampled: Record<string, number> = {}
  for (const code of COUNTRY_CODES) {
    const chosen = [...(byCountry.get(code) ?? [])]
      .sort(byHash(options.seed, (row) => row.domain))
      .slice(0, quota[code] ?? 0)
    sampled[code] = chosen.length
    rows.push(...chosen)
  }
  rows.sort((a, b) => a.rank - b.rank || (a.domain < b.domain ? -1 : 1))
  return { rows, populations, sampled, optedOut }
}

export const FRAME_HEADER = 'domain,rank,country'

export function frameCsv(rows: readonly FrameRow[]): string {
  return `${FRAME_HEADER}\n${rows.map((r) => `${r.domain},${String(r.rank)},${r.country}`).join('\n')}\n`
}

export function parseFrameCsv(text: string): FrameRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines[0]?.trim() !== FRAME_HEADER) throw new Error(`The frame's header is ${FRAME_HEADER}`)
  const seen = new Set<string>()
  return lines.slice(1).map((line, index) => {
    const [domain, rank, country, ...rest] = line.split(',')
    const name = domain === undefined ? null : normalizeDomain(domain)
    const place = Number(rank)
    if (
      rest.length > 0 ||
      name === null ||
      !Number.isInteger(place) ||
      place < 1 ||
      country === undefined ||
      countryOfDomain(name) !== country ||
      seen.has(name)
    ) {
      throw new Error(`Line ${String(index + 2)} of the frame is not a site of it`)
    }
    seen.add(name)
    return { domain: name, rank: place, country }
  })
}

/** The shape of the frame's companion file: how the frame was made, and the counts that weight it. */
export interface FrameMeta {
  readonly source: 'tranco'
  readonly listId: string
  /** When the list was made (Tranco's own date), when its service said. */
  readonly listCreatedOn: string | null
  readonly seed: string
  readonly cap: number
  readonly floor: number
  readonly total: number
  readonly populations: Readonly<Record<string, number>>
  readonly sampled: Readonly<Record<string, number>>
  readonly optedOut: number
  /** SHA-256 of the frame's CSV, so a crawl is tied to exactly this frame. */
  readonly sha256: string
}

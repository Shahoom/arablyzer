import { describe, expect, it } from 'vitest'
import { COUNTRY_CODES, countryOfDomain } from '../src/countries'
import {
  allocate,
  buildFrame,
  frameCsv,
  isOptedOut,
  normalizeDomain,
  parseFrameCsv,
  parseOptOut,
  parseTranco,
  type TrancoEntry,
} from '../src/frame'

/** A list with `perCountry` sites on each of the frame's domains, and some that are not. */
function list(perCountry: Record<string, number>): TrancoEntry[] {
  const entries: TrancoEntry[] = []
  let rank = 1
  for (const [code, n] of Object.entries(perCountry)) {
    for (let i = 0; i < n; i++) entries.push({ rank: rank++, domain: `site${String(i)}.${code}` })
  }
  entries.push({ rank, domain: 'google.com' }, { rank: rank + 1, domain: 'example.com.sa.com' })
  return entries
}

describe('the Tranco list', () => {
  it('is read as rank,domain, and a line that is not that is counted', () => {
    const { entries, invalid } = parseTranco(
      '1,Google.com\n2,example.sa.\n3,not a domain\nx,bad.sa\n\n4,a_b.sa\n',
    )
    expect(entries).toEqual([
      { rank: 1, domain: 'google.com' },
      { rank: 2, domain: 'example.sa' },
    ])
    expect(invalid).toBe(3)
  })

  it('names the country of a domain by its last label alone', () => {
    expect(countryOfDomain('shop.com.sa')).toBe('sa')
    expect(countryOfDomain('example.sa.com')).toBeNull()
    expect(countryOfDomain('example.so')).toBeNull()
    expect(COUNTRY_CODES).toHaveLength(19)
  })
})

describe('the sample frame', () => {
  it('keeps the Arab country domains and nothing else, with their rank and country', () => {
    const frame = buildFrame(list({ sa: 3, eg: 2, ae: 1 }), { cap: 100, floor: 10, seed: 's' })
    expect(frame.rows.map((r) => r.country).sort()).toEqual(['ae', 'eg', 'eg', 'sa', 'sa', 'sa'])
    expect(frame.rows.some((r) => r.domain === 'google.com')).toBe(false)
    expect(frame.rows.find((r) => r.domain === 'site0.sa')).toMatchObject({
      rank: 1,
      country: 'sa',
    })
    expect(frame.populations.sa).toBe(3)
    expect(frame.populations.ye).toBe(0)
  })

  it('is the same for the same list and seed, whatever the order of the list', () => {
    const entries = list({ sa: 60, eg: 50, ma: 40 })
    const options = { cap: 60, floor: 10, seed: 'fixed' }
    const a = buildFrame(entries, options)
    const b = buildFrame([...entries].reverse(), options)
    expect(frameCsv(b.rows)).toBe(frameCsv(a.rows))
    expect(frameCsv(buildFrame(entries, { ...options, seed: 'other' }).rows)).not.toBe(
      frameCsv(a.rows),
    )
  })

  it('takes every site when the cap is above the list, and the cap when it is below', () => {
    const entries = list({ sa: 60, eg: 50, ma: 40 })
    expect(buildFrame(entries, { cap: 1000, floor: 10, seed: 's' }).rows).toHaveLength(150)
    const cut = buildFrame(entries, { cap: 90, floor: 10, seed: 's' })
    expect(cut.rows).toHaveLength(90)
    expect(Object.values(cut.sampled).reduce((a, b) => a + b, 0)).toBe(90)
  })

  it('leaves out the sites whose owners asked, with or without www', () => {
    const optOut = parseOptOut('# asked\nwww.site1.sa\nsite0.eg # by mail\n')
    expect(isOptedOut('site1.sa', optOut)).toBe(true)
    const frame = buildFrame(list({ sa: 3, eg: 2 }), { cap: 100, floor: 10, seed: 's', optOut })
    expect(frame.rows.map((r) => r.domain)).not.toContain('site1.sa')
    expect(frame.rows.map((r) => r.domain)).not.toContain('site0.eg')
    expect(frame.optedOut).toBe(2)
  })

  it('is a CSV of domain, rank and country, and reads back; a changed line is refused', () => {
    const frame = buildFrame(list({ sa: 3, eg: 2 }), { cap: 100, floor: 10, seed: 's' })
    const csv = frameCsv(frame.rows)
    expect(csv.split('\n')[0]).toBe('domain,rank,country')
    expect(parseFrameCsv(csv)).toEqual(frame.rows)
    expect(() => parseFrameCsv(csv.replace('site0.sa,1,sa', 'site0.sa,1,eg'))).toThrow()
    expect(() => parseFrameCsv(csv.replace('domain,rank,country', 'domain,rank'))).toThrow()
    expect(() => parseFrameCsv(`${csv}site0.sa,9,sa\n`)).toThrow()
  })
})

describe('the allocation by country', () => {
  it('gives every country its floor and shares the rest by what it has left', () => {
    const quota = allocate({ sa: 5000, eg: 4000, kw: 100, sy: 20 }, 3000, 200)
    expect(quota.kw).toBe(100)
    expect(quota.sy).toBe(20)
    expect(quota.sa).toBeGreaterThan(quota.eg ?? 0)
    expect(Object.values(quota).reduce((a, b) => a + b, 0)).toBe(3000)
    expect(quota.sa).toBeGreaterThanOrEqual(200)
  })

  it('cuts the floors in proportion when they alone are over the cap', () => {
    const quota = allocate({ sa: 500, eg: 500 }, 100, 300)
    expect(quota.sa).toBe(50)
    expect(quota.eg).toBe(50)
  })

  it('is whole numbers that never pass what a country has', () => {
    const populations = { sa: 7, eg: 3, ma: 11, dz: 1 }
    for (let cap = 1; cap < 22; cap++) {
      const quota = allocate(populations, cap, 2)
      expect(Object.values(quota).reduce((a, b) => a + b, 0)).toBe(Math.min(cap, 22))
      for (const [code, n] of Object.entries(quota)) {
        expect(Number.isInteger(n)).toBe(true)
        expect(n).toBeLessThanOrEqual(populations[code as keyof typeof populations])
      }
    }
  })
})

describe('domain names', () => {
  it('are lower case ASCII hosts', () => {
    expect(normalizeDomain(' Example.SA. ')).toBe('example.sa')
    expect(normalizeDomain('a_b.sa')).toBeNull()
    expect(normalizeDomain('localhost')).toBeNull()
    expect(normalizeDomain('http://example.sa')).toBeNull()
  })
})

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  countByReason,
  exclusionOf,
  exclusionsCsv,
  GLOBAL_BRANDS,
  parseExclusionsCsv,
  VANITY_DOMAINS,
} from '../src/exclusions'
import { buildFrame, frameCsv, parseFrameCsv, type TrancoEntry } from '../src/frame'
import { entriesOfFrame, FRAMES_DIR, frameIds, loadFrame, metaOf, sha256 } from '../src/frame-files'

const list = (...domains: string[]): TrancoEntry[] =>
  domains.map((domain, index) => ({ rank: index + 1, domain }))

describe('the sites left out of the frame', () => {
  it('keeps of .ly only the second-level public suffixes, and drops the single names', () => {
    for (const domain of [
      'bit.ly',
      'cutt.ly',
      'ow.ly',
      't.ly',
      'buff.ly',
      'rebrand.ly',
      'musical.ly',
      'genial.ly',
      'visual.ly',
      'list.ly',
      'embed.ly',
      'iframe.ly',
      'count.ly',
      'adf.ly',
      'dai.ly',
      'tithe.ly',
      'libyana.ly',
      'com.ly',
      'foo.ly.ly',
    ]) {
      expect(exclusionOf(domain), domain).toBe('ly-single-label')
    }
    for (const suffix of ['gov', 'com', 'edu', 'org', 'net', 'sch', 'plc', 'med', 'id']) {
      expect(exclusionOf(`name.${suffix}.ly`), suffix).toBeNull()
    }
    // A name under a suffix that is not one of the nine is not Libya's either.
    expect(exclusionOf('name.co.ly')).toBe('ly-single-label')
  })

  it('does not drop a single name on the other country domains, only the hacks named one by one', () => {
    expect(VANITY_DOMAINS.has('lu.ma')).toBe(true)
    expect(exclusionOf('lu.ma')).toBe('vanity-domain')
    expect(exclusionOf('cre.ma')).toBe('vanity-domain')
    for (const domain of [
      'avito.ma',
      'jumia.ma',
      'absher.sa',
      'nic.ae',
      'mada.ps',
      'shop.com.sa',
    ]) {
      expect(exclusionOf(domain), domain).toBeNull()
    }
  })

  it('drops a global brand’s mirror on any country domain, with or without a generic second level', () => {
    for (const brand of GLOBAL_BRANDS) {
      expect(exclusionOf(`${brand}.sa`), brand).toBe('global-brand')
      expect(exclusionOf(`${brand}.com.eg`), brand).toBe('global-brand')
      expect(exclusionOf(`${brand}.co.ma`), brand).toBe('global-brand')
    }
    expect(GLOBAL_BRANDS.size).toBe(17)
    for (const domain of [
      'google.ps',
      'google.iq',
      'google.co.ma',
      'google.com.ly',
      'youtube.ly',
      'amazon.eg',
    ]) {
      expect(exclusionOf(domain), domain).toBe('global-brand')
    }
  })

  it('does not take a site for a brand because its name holds the brand’s', () => {
    for (const domain of [
      'googleads.sa',
      'my-google.ae',
      'xe.sa',
      'applecare.eg',
      'amazon.shop.sa',
      'google.gov.sa',
      'alamazon.sa',
    ]) {
      expect(exclusionOf(domain), domain).toBeNull()
    }
  })

  it('is out of the frame, and out of the populations that weight the report, with its reason recorded', () => {
    const frame = buildFrame(
      list('bit.ly', 'google.com.sa', 'absher.sa', 'cbl.gov.ly', 'lu.ma', 'avito.ma', 'youtube.ly'),
      { cap: 100, floor: 10, seed: 's' },
    )
    expect(frame.rows.map((r) => r.domain)).toEqual(['absher.sa', 'cbl.gov.ly', 'avito.ma'])
    expect(frame.populations).toMatchObject({ sa: 1, ly: 1, ma: 1 })
    expect(frame.excluded).toEqual([
      { domain: 'bit.ly', rank: 1, country: 'ly', reason: 'ly-single-label' },
      { domain: 'google.com.sa', rank: 2, country: 'sa', reason: 'global-brand' },
      { domain: 'lu.ma', rank: 5, country: 'ma', reason: 'vanity-domain' },
      { domain: 'youtube.ly', rank: 7, country: 'ly', reason: 'global-brand' },
    ])
    expect(countByReason(frame.excluded)).toEqual({
      'global-brand': 2,
      'ly-single-label': 1,
      'vanity-domain': 1,
    })
  })

  it('is the same list again from any order of the input', () => {
    const entries = list('bit.ly', 'google.com.sa', 'absher.sa', 'lu.ma', 'cbl.gov.ly')
    const a = buildFrame(entries, { cap: 100, floor: 10, seed: 's' })
    const b = buildFrame([...entries].reverse(), { cap: 100, floor: 10, seed: 's' })
    expect(exclusionsCsv(b.excluded)).toBe(exclusionsCsv(a.excluded))
    expect(frameCsv(b.rows)).toBe(frameCsv(a.rows))
  })

  it('is a CSV of domain, rank, country and reason, and reads back; a line the rules would keep is refused', () => {
    const frame = buildFrame(list('bit.ly', 'google.com.sa', 'absher.sa'), {
      cap: 100,
      floor: 10,
      seed: 's',
    })
    const csv = exclusionsCsv(frame.excluded)
    expect(csv.split('\n')[0]).toBe('domain,rank,country,reason')
    expect(parseExclusionsCsv(csv)).toEqual(frame.excluded)
    expect(() => parseExclusionsCsv(`${csv}absher.sa,3,sa,global-brand\n`)).toThrow()
    expect(() => parseExclusionsCsv(csv.replace('ly-single-label', 'vanity-domain'))).toThrow()
    expect(exclusionsCsv([])).toBe('domain,rank,country,reason\n')
  })

  it('cannot be put back into the frame’s file by hand', () => {
    const csv = 'domain,rank,country\nbit.ly,118,ly\n'
    expect(() => parseFrameCsv(csv)).toThrow()
    expect(parseFrameCsv(csv, { keepExcluded: true })).toHaveLength(1)
  })
})

describe('the committed frame', () => {
  const id = frameIds().at(-1) ?? ''
  const { rows, excluded, meta } = loadFrame(id)

  it('has none of the sites the rules leave out, and says how many it left out', () => {
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.filter((row) => exclusionOf(row.domain) !== null)).toEqual([])
    expect(meta.excluded).toBe(excluded.length)
    expect(meta.exclusions).toEqual(countByReason(excluded))
    expect(meta.total).toBe(rows.length)
    expect(Object.values(meta.populations).reduce((a, b) => a + b, 0)).toBe(rows.length)
    const domains = new Set(rows.map((row) => row.domain))
    for (const gone of ['bit.ly', 'cutt.ly', 'lu.ma', 'cre.ma', 'google.iq', 'google.co.ma']) {
      expect(domains.has(gone), gone).toBe(false)
    }
    expect(excluded.find((row) => row.domain === 'bit.ly')?.reason).toBe('ly-single-label')
  })

  it('is the frame its exclusions and rows were made into: nothing is both, and each is the file the metadata hashes', () => {
    const kept = new Set(rows.map((row) => row.domain))
    expect(excluded.filter((row) => kept.has(row.domain))).toEqual([])
    expect(sha256(readFileSync(join(FRAMES_DIR, `${id}.exclusions.csv`), 'utf8'))).toBe(
      meta.exclusionsSha256,
    )
  })

  it('is made again, byte for byte, from the frame as committed (the rules of the code are the frame’s)', () => {
    const prior = entriesOfFrame(id)
    const again = buildFrame(prior.entries, {
      cap: prior.meta.cap,
      floor: prior.meta.floor,
      seed: prior.meta.seed,
    })
    const csv = frameCsv(again.rows)
    expect(csv).toBe(readFileSync(join(FRAMES_DIR, `${id}.csv`), 'utf8'))
    expect(exclusionsCsv(again.excluded)).toBe(
      readFileSync(join(FRAMES_DIR, `${id}.exclusions.csv`), 'utf8'),
    )
    expect(
      metaOf(
        { ...again, optedOut: again.optedOut + prior.meta.optedOut },
        {
          listId: id,
          listCreatedOn: prior.meta.listCreatedOn,
          seed: prior.meta.seed,
          cap: prior.meta.cap,
          floor: prior.meta.floor,
        },
        csv,
      ),
    ).toEqual({ ...meta })
  })

  it('refuses a frame whose exclusions are not the file its metadata hashes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sotaw-frame-'))
    try {
      for (const name of [`${id}.csv`, `${id}.json`, `${id}.exclusions.csv`]) {
        writeFileSync(join(dir, name), readFileSync(join(FRAMES_DIR, name)))
      }
      expect(loadFrame(id, dir).rows).toHaveLength(rows.length)
      writeFileSync(
        join(dir, `${id}.exclusions.csv`),
        `${readFileSync(join(FRAMES_DIR, `${id}.exclusions.csv`), 'utf8')}x.ly,9,ly,ly-single-label\n`,
      )
      expect(() => loadFrame(id, dir)).toThrow(/exclusions/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('cannot be made from a frame that was sampled: the sites it has are not all of them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sotaw-frame-'))
    try {
      const csv = readFileSync(join(FRAMES_DIR, `${id}.csv`), 'utf8')
      writeFileSync(join(dir, `${id}.csv`), csv)
      const sampled = { ...meta, sampled: { ...meta.sampled, sa: (meta.sampled.sa ?? 0) - 1 } }
      writeFileSync(join(dir, `${id}.json`), JSON.stringify(sampled))
      expect(() => entriesOfFrame(id, dir)).toThrow(/sample/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

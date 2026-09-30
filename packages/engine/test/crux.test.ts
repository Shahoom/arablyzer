import { serveCrux, type CruxData, type CruxStandIn } from '@arablyzer/fixtures'
import { createPolicy } from '@arablyzer/egress'
import { RULES } from '@arablyzer/rules'
import { afterEach, describe, expect, it } from 'vitest'
import { scan } from '../src/index'
import { tempSite, type TempSite } from './helpers'

const KEY = 'crux-test-key-5c1d'
const CRUX_RULES = ['cwv-cls-poor', 'cwv-inp-poor', 'cwv-lcp-poor']
const PAGE = '<!doctype html><html lang="ar" dir="rtl"><body><h1>متجر</h1></body></html>'

let site: TempSite | undefined
let standIn: CruxStandIn | undefined

afterEach(async () => {
  await site?.close()
  await standIn?.close()
  site = undefined
  standIn = undefined
})

/** Scans a local page with the CrUX rules alone, against a stand-in answering `data`. */
async function scanWith(data: CruxData | null, key: string | null = KEY) {
  site = await tempSite({ 'index.html': PAGE })
  standIn = data === null ? undefined : await serveCrux(data)
  const targets = [{ address: '127.0.0.1', port: site.port }]
  if (standIn !== undefined) targets.push({ address: '127.0.0.1', port: standIn.port })
  return scan(site.url('/'), {
    ruleIds: CRUX_RULES,
    policy: createPolicy({ allowTargets: targets }),
    ...(key === null || standIn === undefined
      ? {}
      : { crux: { apiKey: key, endpoint: standIn.endpoint } }),
  })
}

const statuses = (report: Awaited<ReturnType<typeof scan>>) =>
  Object.fromEntries(report.rules.map((rule) => [rule.id, rule.status]))

describe('CrUX in a scan (M1.3b)', () => {
  it('has three rules that read it', () => {
    expect(RULES.filter((rule) => rule.needs.includes('crux')).map((rule) => rule.id)).toEqual(
      CRUX_RULES,
    )
  })

  it("asks about the page's URL on phones, with the key in a header, and reports what came", async () => {
    const report = await scanWith({ url: { lcp: 5_200, inp: 180, cls: 0.05 } })
    expect(standIn?.queries).toEqual([{ url: site?.url('/'), formFactor: 'PHONE', key: KEY }])
    expect(statuses(report)).toEqual({
      'cwv-cls-poor': 'pass',
      'cwv-inp-poor': 'pass',
      'cwv-lcp-poor': 'fail',
    })
    expect(report.facts.crux).toEqual({
      outcome: 'found',
      scope: 'url',
      key: site?.url('/'),
      period: { first: '2026-08-30', last: '2026-09-26' },
      lcp: 5_200,
      inp: 180,
      cls: 0.05,
    })
    expect(JSON.stringify(report)).not.toContain(KEY)
  })

  it('asks about the origin when the URL has no data, and says so in the finding', async () => {
    const report = await scanWith({ origin: { lcp: 2_000, inp: 700, cls: 0.05 } })
    expect(standIn?.queries.map((query) => Object.keys(query).find((k) => k !== 'key'))).toEqual([
      'url',
      'origin',
    ])
    expect(report.findings.map((finding) => finding.ruleId)).toEqual(['cwv-inp-poor'])
    expect(report.findings[0]?.message.en).toContain("this site's pages")
    expect(report.findings[0]?.message.en).toContain('700 ms')
  })

  it('does not apply without data, and says why', async () => {
    const report = await scanWith({})
    expect(Object.values(statuses(report))).toEqual(Array(3).fill('not-applicable'))
    expect(report.scan.notices.map((notice) => notice.code)).toContain('crux-not-found')
    expect(report.facts.crux).toMatchObject({ outcome: 'not-found', scope: null })
  })

  it('does not apply without a key, and asks nothing', async () => {
    const report = await scanWith({ url: { lcp: 9_000 } }, null)
    expect(Object.values(statuses(report))).toEqual(Array(3).fill('not-applicable'))
    expect(report.scan.notices.map((notice) => notice.code)).toContain('crux-no-key')
    expect(standIn?.queries).toEqual([])
    expect(report.facts.crux).toBeUndefined()
  })

  it('makes the score partial when CrUX fails, and keeps its error out of the report', async () => {
    const report = await scanWith({ url: 429 })
    expect(report.rules.map((rule) => [rule.status, rule.error])).toEqual(
      Array(3).fill(['error', 'crux-unchecked']),
    )
    expect(report.scan.status).toBe('partial')
    expect(report.score.partial).toBe(true)
    expect(report.scan.notices.map((notice) => notice.code)).toContain('crux-failed')
    expect(report.facts.crux).toBeUndefined()
  })

  it('never sends a private page to Google', async () => {
    site = await tempSite({ 'index.html': PAGE })
    standIn = await serveCrux({ url: { lcp: 9_000 } })
    const report = await scan(site.url('/'), {
      ruleIds: CRUX_RULES,
      policy: createPolicy({ allowPrivate: true }),
      crux: { apiKey: KEY, endpoint: standIn.endpoint },
    })
    expect(standIn.queries).toEqual([])
    expect(report.scan.notices.map((notice) => notice.code)).toContain('crux-private')
  })
})

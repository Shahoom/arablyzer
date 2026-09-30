import { serveCrux, type CruxData, type CruxStandIn } from '@arablyzer/fixtures'
import { createPolicy } from '@arablyzer/egress'
import { RULES } from '@arablyzer/rules'
import { afterEach, describe, expect, it } from 'vitest'
import { scan, type ScanOptions, type ScanProgress } from '../src/index'
import { tempSite, type TempSite } from './helpers'

const KEY = 'crux-test-key-5c1d'
const CRUX_RULES = ['cwv-cls-poor', 'cwv-inp-poor', 'cwv-lcp-poor']
/** A tool's rules (M2.2): the RTL checker's, which read the page's HTML alone. */
const HTML_RULES = ['ar-html-lang', 'rtl-html-dir']
const PAGE = '<!doctype html><html lang="ar" dir="rtl"><body><h1>متجر</h1></body></html>'

let site: TempSite | undefined
let standIn: CruxStandIn | undefined

afterEach(async () => {
  await site?.close()
  await standIn?.close()
  site = undefined
  standIn = undefined
})

/**
 * Scans a local page, with the CrUX rules alone unless `options` choose others, against a
 * stand-in answering `data`.
 */
async function scanWith(
  data: CruxData | null,
  key: string | null = KEY,
  options: Pick<ScanOptions, 'ruleIds' | 'onProgress'> = { ruleIds: CRUX_RULES },
) {
  site = await tempSite({ 'index.html': PAGE })
  standIn = data === null ? undefined : await serveCrux(data)
  const targets = [{ address: '127.0.0.1', port: site.port }]
  if (standIn !== undefined) targets.push({ address: '127.0.0.1', port: standIn.port })
  return scan(site.url('/'), {
    ...options,
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

  it('asks nothing, and says nothing of CrUX, when no rule the scan runs reads it', async () => {
    const steps: ScanProgress[] = []
    const report = await scanWith({ url: { lcp: 9_000 } }, KEY, {
      ruleIds: HTML_RULES,
      onProgress: (step) => steps.push(step),
    })
    expect(standIn?.queries).toEqual([])
    expect(steps.map((step) => step.step)).not.toContain('crux')
    expect(report.scan.notices.filter((notice) => notice.code.startsWith('crux'))).toEqual([])
    expect(report.facts.crux).toBeUndefined()
  })

  it('asks for a whole scan, whose rules read it', async () => {
    const report = await scanWith({ url: { lcp: 5_200 } }, KEY, {})
    expect(standIn?.queries).toHaveLength(1)
    expect(report.facts.crux).toMatchObject({ outcome: 'found', lcp: 5_200 })
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

  // M2.3c review: CrUX never touches the site, so a site that challenges the scan can still be
  // answered for by real visitors' data; a page the site refuses without a challenge has none asked.
  describe('for a page the scan did not reach', () => {
    const CHALLENGE = '<!doctype html><title>Just a moment...</title><script src="/c.js"></script>'
    async function scanNotReached(status: number, headers: Record<string, string>) {
      site = await tempSite(
        {},
        {
          '/': {
            status,
            headers: { 'content-type': 'text/html; charset=UTF-8', ...headers },
            body: CHALLENGE,
          },
        },
      )
      standIn = await serveCrux({ url: { lcp: 5_200, inp: 180, cls: 0.05 } })
      return scan(site.url('/'), {
        ruleIds: CRUX_RULES,
        policy: createPolicy({
          allowTargets: [site.port, standIn.port].map((port) => ({ address: '127.0.0.1', port })),
        }),
        crux: { apiKey: KEY, endpoint: standIn.endpoint },
      })
    }

    it.each([
      ['a Cloudflare challenge', 403, { 'cf-mitigated': 'challenge' }],
      ['an AWS WAF challenge', 202, { 'x-amzn-waf-action': 'challenge' }],
    ])(
      'asks about %s, and the rules that read it judge the data',
      async (_name, status, header) => {
        const report = await scanNotReached(status, header)
        expect(standIn?.queries).toEqual([{ url: site?.url('/'), formFactor: 'PHONE', key: KEY }])
        expect(statuses(report)).toEqual({
          'cwv-cls-poor': 'pass',
          'cwv-inp-poor': 'pass',
          'cwv-lcp-poor': 'fail',
        })
        expect(report.facts.crux).toMatchObject({ outcome: 'found', lcp: 5_200 })
        expect(report.scan.notices.map((notice) => notice.code)).toEqual(['bot-challenge'])
        // The page itself was not reached: partial, and no score, as for any such scan.
        expect(report.scan.status).toBe('partial')
        expect(report.score.overall).toBeNull()
      },
    )

    it.each([403, 404, 503])('asks nothing about a page that answers HTTP %i', async (status) => {
      const report = await scanNotReached(status, {})
      expect(standIn?.queries).toEqual([])
      expect(Object.values(statuses(report))).toEqual(Array(3).fill('not-applicable'))
      expect(report.facts.crux).toBeUndefined()
    })
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

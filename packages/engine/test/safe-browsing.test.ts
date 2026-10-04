import { createPolicy } from '@arablyzer/egress'
import {
  serveSafeBrowsing,
  type SafeBrowsingData,
  type SafeBrowsingStandIn,
} from '@arablyzer/fixtures'
import { afterEach, describe, expect, it } from 'vitest'
import { scan } from '../src/index'
import { tempSite, type TempSite } from './helpers'

const KEY = 'sb-test-key-77aa'
const RULE = ['safe-browsing-flagged']
const PAGE = '<!doctype html><html lang="ar" dir="rtl"><body><h1>متجر</h1></body></html>'

let site: TempSite | undefined
let standIn: SafeBrowsingStandIn | undefined

afterEach(async () => {
  await site?.close()
  await standIn?.close()
  site = undefined
  standIn = undefined
})

async function scanWith(data: SafeBrowsingData, key: string | null = KEY, ruleIds = RULE) {
  site = await tempSite({ 'index.html': PAGE })
  standIn = await serveSafeBrowsing(data)
  return scan(site.url('/'), {
    ruleIds,
    policy: createPolicy({
      allowTargets: [site.port, standIn.port].map((port) => ({ address: '127.0.0.1', port })),
    }),
    ...(key === null ? {} : { safeBrowsing: { apiKey: key, endpoint: standIn.endpoint } }),
  })
}

const codes = (report: Awaited<ReturnType<typeof scan>>) =>
  report.scan.notices.map((notice) => notice.code)

describe('Safe Browsing in a scan', () => {
  it("asks about the page's URL and its origin with the key in a header, and fails a flagged page", async () => {
    const report = await scanWith({ threats: ['MALWARE', 'SOCIAL_ENGINEERING'] })
    expect(standIn?.queries).toEqual([{ urls: [site?.url('/')], key: KEY }])
    expect(report.rules.map((rule) => rule.status)).toEqual(['fail'])
    expect(report.findings.map((finding) => finding.severity)).toEqual(['critical', 'critical'])
    expect(report.findings.map((finding) => finding.message.en)).toEqual([
      expect.stringContaining('malware'),
      expect.stringContaining('phishing'),
    ])
    expect(JSON.stringify(report)).not.toContain(KEY)
  })

  it('passes a page Google does not list', async () => {
    const report = await scanWith({})
    expect(report.rules.map((rule) => rule.status)).toEqual(['pass'])
    expect(report.findings).toEqual([])
    expect(codes(report)).toEqual([])
  })

  it('does not apply without a key, asks nothing, and says why', async () => {
    const report = await scanWith({ threats: ['MALWARE'] }, null)
    expect(report.rules.map((rule) => rule.status)).toEqual(['not-applicable'])
    expect(codes(report)).toContain('safe-browsing-no-key')
    expect(standIn?.queries).toEqual([])
  })

  it.each([
    [403, 'safe-browsing-refused'],
    [503, 'safe-browsing-failed'],
  ])('is an error and a notice, never a verdict, when Google answers %i', async (error, code) => {
    const report = await scanWith({ error })
    expect(report.rules.map((rule) => [rule.status, rule.error])).toEqual([
      ['error', 'safe-browsing-unchecked'],
    ])
    expect(report.scan.status).toBe('partial')
    expect(report.findings).toEqual([])
    expect(codes(report)).toContain(code)
  })

  it('asks nothing, and says nothing of it, when no rule the scan runs reads it', async () => {
    const report = await scanWith({ threats: ['MALWARE'] }, KEY, ['ar-html-lang'])
    expect(standIn?.queries).toEqual([])
    expect(codes(report).filter((code) => code.startsWith('safe-browsing'))).toEqual([])
  })

  it('never sends a private page to Google', async () => {
    site = await tempSite({ 'index.html': PAGE })
    standIn = await serveSafeBrowsing({ threats: ['MALWARE'] })
    const report = await scan(site.url('/'), {
      ruleIds: RULE,
      policy: createPolicy({ allowPrivate: true }),
      safeBrowsing: { apiKey: KEY, endpoint: standIn.endpoint },
    })
    expect(standIn.queries).toEqual([])
    expect(codes(report)).toContain('safe-browsing-private')
  })
})

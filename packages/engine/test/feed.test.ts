import { createPolicy } from '@arablyzer/egress'
import { afterEach, describe, expect, it } from 'vitest'
import { scan } from '../src/index'
import { tempSite, type TempSite } from './helpers'

let site: TempSite | undefined
afterEach(async () => {
  await site?.close()
  site = undefined
})

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>t</title>
<item><g:id>1</g:id><title>عطر</title><description>وصف العطر</description><link>https://shop.example/1</link>
<g:image_link>https://shop.example/1.jpg</g:image_link><g:price>12.50 SAR</g:price><g:availability>متوفر</g:availability></item>
</channel></rss>`

const FEED_RULES = [
  'feed-file-unreadable',
  'feed-required-missing',
  'feed-values-invalid',
  'feed-text-quality',
]

async function scanOf(files: Record<string, string | Uint8Array>, path: string, ruleIds: string[]) {
  site = await tempSite(files)
  return scan(site.url(path), {
    ruleIds,
    policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
  })
}

const statuses = (report: Awaited<ReturnType<typeof scan>>) =>
  Object.fromEntries(report.rules.map((rule) => [rule.id, rule.status]))

// M6.1: the address a tool is given is read as a product feed, for the rules that want one.
describe('a product feed in a scan', () => {
  it('judges the file at the address, and says nothing of the page it is not', async () => {
    const report = await scanOf({ 'feed.xml': FEED }, '/feed.xml', FEED_RULES)
    expect(statuses(report)).toEqual({
      'feed-file-unreadable': 'pass',
      'feed-required-missing': 'pass',
      'feed-text-quality': 'pass',
      'feed-values-invalid': 'fail',
    })
    expect(
      report.findings.map((finding) => [finding.ruleId, finding.evidence.values?.value]),
    ).toEqual([['feed-values-invalid', 'متوفر']])
    // A feed is not an HTML page, and the scan does not say it is not one.
    expect(report.scan.notices.map((notice) => notice.code)).not.toContain('not-html')
  })

  it('says a web page is no feed', async () => {
    const report = await scanOf(
      { 'index.html': '<!doctype html><html lang="ar"><title>متجر</title><p>مرحبا</p></html>' },
      '/',
      FEED_RULES,
    )
    expect(statuses(report)).toMatchObject({
      'feed-file-unreadable': 'fail',
      'feed-required-missing': 'not-applicable',
    })
    expect(report.findings[0]?.message.en).toContain('web page')
  })

  it('could not check a gzip file served as it is, and says so', async () => {
    const report = await scanOf(
      { 'feed.xml.gz': Uint8Array.of(0x1f, 0x8b, 8, 0, 0, 0) },
      '/feed.xml.gz',
      FEED_RULES,
    )
    expect(statuses(report)['feed-file-unreadable']).toBe('error')
    expect(report.rules.find((rule) => rule.id === 'feed-file-unreadable')).toMatchObject({
      error: 'feed-compressed',
    })
    expect(report.scan.notices.map((notice) => notice.code)).toContain('feed-compressed')
  })

  it('is never asked in a whole scan', async () => {
    site = await tempSite({
      'index.html': '<!doctype html><html lang="ar"><title>متجر</title></html>',
    })
    const report = await scan(site.url('/'), {
      policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
    })
    expect(report.rules.some((rule) => FEED_RULES.includes(rule.id))).toBe(false)
  })
})

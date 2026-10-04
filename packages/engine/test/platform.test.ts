import { createPolicy } from '@arablyzer/egress'
import { afterEach, describe, expect, it } from 'vitest'
import { scan } from '../src/index'
import { tempSite, type TempSite } from './helpers'

let site: TempSite | undefined
afterEach(async () => {
  await site?.close()
  site = undefined
})

const page = (head: string) =>
  `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">${head}</head><body><h1>متجر</h1></body></html>`

async function scanOf(html: string, ruleIds: string[] | undefined) {
  site = await tempSite({ 'index.html': html })
  return scan(site.url('/'), {
    ...(ruleIds === undefined ? {} : { ruleIds }),
    policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
  })
}

describe('the platform in a scan', () => {
  it('gives the report the platform, its version and the technologies the page shows', async () => {
    const report = await scanOf(page('<meta name="generator" content="WordPress 6.4.2">'), [
      'platform-detected',
    ])
    expect(report.facts.platform?.primary).toMatchObject({ id: 'wordpress', version: '6.4.2' })
    expect(report.facts.platform?.technologies.map((tech) => tech.name)).toContain('WordPress')
    expect(report.findings.map((finding) => finding.severity)).toEqual(['info'])
  })

  it('has a platform of none for a page that shows none, and nothing without the rule', async () => {
    const none = await scanOf(page(''), ['platform-detected'])
    expect(none.facts.platform).toEqual({ primary: null, technologies: [] })
    const other = await scanOf(page('<meta name="generator" content="WordPress 6.4.2">'), [
      'ar-html-lang',
    ])
    expect(other.facts.platform).toBeUndefined()
  })
})

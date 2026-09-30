import { createPolicy } from '@arablyzer/egress'
import { loadSiteConfig, serveCrux, serveSite } from '@arablyzer/fixtures'
import type { Report } from '@arablyzer/report-schema'
import { afterEach, describe, expect, it } from 'vitest'
import { scan } from '../src/index'
import { FIXTURE_CASES } from './fixture-cases'
import {
  flagRule,
  policyFor,
  resolverFor,
  schemaErrors,
  tempSite,
  testRule,
  type TempSite,
} from './helpers'

// H1 of the pre-launch review: with `isolateParse` the scan reads the page's HTML in a thread of
// its own, with a heap of its own. What it reads is what it reads here, and a page that is too
// much for the thread is too complex, where read here it could end the process.

let sites: TempSite[] = []

afterEach(async () => {
  await Promise.all(sites.map((site) => site.close()))
  sites = []
})

async function site(...args: Parameters<typeof tempSite>): Promise<TempSite> {
  const created = await tempSite(...args)
  sites.push(created)
  return created
}

/** Everything except the two values that may differ between runs. */
function stable(report: Report) {
  return {
    ...report,
    target: { ...report.target, fetchedAt: '' },
    scan: { ...report.scan, durationMs: 0 },
  }
}

describe('scan with the page read in a thread of its own', () => {
  // Every twentieth of the rules' fixtures: pages of every kind the rules were written for, whose
  // reports were checked one by one.
  const sample = FIXTURE_CASES.filter((_, index) => index % 20 === 0)

  it.each(sample)('gives $ruleId/$fixture the report it has when read here', async ({ dir }) => {
    const local = await serveSite(dir)
    // A site with CrUX data is scanned with a key, against a local stand-in for the API.
    const data = (await loadSiteConfig(dir)).crux
    const crux = data === undefined ? undefined : await serveCrux(data)
    try {
      const options = {
        policy:
          crux === undefined
            ? policyFor(local)
            : createPolicy({
                allowTargets: [
                  { address: '127.0.0.1', port: local.port },
                  { address: '127.0.0.1', port: crux.port },
                ],
              }),
        resolver: resolverFor(local),
        ...(crux === undefined ? {} : { crux: { apiKey: 'fixture-key', endpoint: crux.endpoint } }),
      }
      const here = await scan(local.url('/'), options)
      const there = await scan(local.url('/'), { ...options, isolateParse: {} })
      expect(schemaErrors(there)).toBe('')
      expect(stable(there)).toEqual(stable(here))
    } finally {
      await local.close()
      await crux?.close()
    }
  })

  // The tree of 130,000 links is the biggest the collector allows of pages of this kind, and
  // needs more than a thread's 384 MB (measured: it reads in 512).
  it('finds a page too big for the thread’s heap too complex, and goes on with the rest', async () => {
    const links = `<a href="/${'a'.repeat(70)}" class="c">ب</a>`.repeat(130_000)
    const local = await site(
      { 'index.html': `<html lang="ar"><body>${links}</body></html>`, 'robots.txt': 'x' },
      { '/': { compress: 'gzip' } },
    )
    const header = testRule({ id: 'header-rule', needs: ['http'], detect: () => [] })
    const report = await scan(local.url('/'), {
      rules: [flagRule(), header],
      policy: policyFor(local),
      isolateParse: { maxHeapMb: 128 },
    })
    expect(schemaErrors(report)).toBe('')
    expect(report.scan.status).toBe('partial')
    expect(report.scan.notices.map((item) => item.code)).toEqual(['page-too-complex'])
    expect(report.rules.map((rule) => [rule.id, rule.status, rule.error])).toEqual([
      ['header-rule', 'pass', undefined],
      ['test-rule', 'error', 'page-too-complex'],
    ])
  })
})

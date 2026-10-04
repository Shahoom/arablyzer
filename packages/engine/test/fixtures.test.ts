import {
  loadSiteConfig,
  serveCrux,
  serveSafeBrowsing,
  serveSite,
  trustFixtureCa,
} from '@arablyzer/fixtures'
import { createPolicy } from '@arablyzer/egress'
import { RULES } from '@arablyzer/rules'
import { describe, expect, it } from 'vitest'
import { scan } from '../src/index'
import { FIXTURE_CASES, RENDER_RULES } from './fixture-cases'
import { policyFor, resolverFor, schemaErrors } from './helpers'

// Fixture sites served over HTTPS carry certificates from the test authority.
trustFixtureCa()

// docs/design/phase-0.md §2: each wrong fixture fails its own rule alone; each right fixture
// passes all rules, so it can serve as a clean example on the rule's page. Rules that need the
// rendered page are left out here; the browser suite renders their fixtures.
describe('rule fixtures over HTTP', () => {
  it('has at least a wrong and a right fixture per rule', () => {
    expect(FIXTURE_CASES.length).toBeGreaterThanOrEqual(RULES.length * 2)
  })

  it.each(FIXTURE_CASES)('$ruleId/$fixture', async ({ ruleId, fixture, dir, alsoFails }) => {
    const site = await serveSite(dir)
    // A site with CrUX data is scanned with a key, against a local stand-in for the API.
    const config = await loadSiteConfig(dir)
    const data = config.crux
    const crux = data === undefined ? undefined : await serveCrux(data)
    // The same for Safe Browsing data.
    const sbData = config.safeBrowsing
    const safeBrowsing = sbData === undefined ? undefined : await serveSafeBrowsing(sbData)
    const stoodIn = [crux, safeBrowsing].flatMap((standIn) =>
      standIn === undefined ? [] : [standIn],
    )
    try {
      const report = await scan(site.url('/'), {
        policy:
          stoodIn.length === 0
            ? policyFor(site)
            : createPolicy({
                allowTargets: [site, ...stoodIn].map(({ port }) => ({
                  address: '127.0.0.1',
                  port,
                })),
              }),
        resolver: resolverFor(site),
        ...(crux === undefined ? {} : { crux: { apiKey: 'fixture-key', endpoint: crux.endpoint } }),
        ...(safeBrowsing === undefined
          ? {}
          : { safeBrowsing: { apiKey: 'fixture-key', endpoint: safeBrowsing.endpoint } }),
      })
      expect(schemaErrors(report)).toBe('')
      // A challenge is not the page (M2.3c): none of the page was checked, so the scan is short
      // and has no score, though the rules beside the page ran and passed.
      const challenged = ruleId === 'bot-challenge' && fixture.startsWith('wrong')
      expect(report.scan).toMatchObject({ status: challenged ? 'partial' : 'complete' })
      if (challenged) expect(report.score.overall).toBeNull()
      const failed = report.rules.filter((rule) => rule.status === 'fail').map((rule) => rule.id)
      if (RENDER_RULES.has(ruleId)) {
        // Without a browser, a render rule's fixtures must pass every other rule.
        expect(failed.sort()).toEqual(alsoFails.filter((id) => !RENDER_RULES.has(id)).sort())
        expect(report.scan.notices.map((notice) => notice.code)).toContain('render-skipped')
      } else if (fixture.startsWith('wrong')) {
        expect(failed.sort()).toEqual([ruleId, ...alsoFails].sort())
      } else {
        expect(failed).toEqual([])
        expect(report.rules.find((rule) => rule.id === ruleId)?.status).toBe('pass')
      }
    } finally {
      await site.close()
      await crux?.close()
      await safeBrowsing?.close()
    }
  })
})

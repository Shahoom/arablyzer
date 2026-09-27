import { loadSiteConfig, serveCrux, serveSite, trustFixtureCa } from '@arablyzer/fixtures'
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
    const data = (await loadSiteConfig(dir)).crux
    const crux = data === undefined ? undefined : await serveCrux(data)
    try {
      const report = await scan(site.url('/'), {
        policy:
          crux === undefined
            ? policyFor(site)
            : createPolicy({
                allowTargets: [
                  { address: '127.0.0.1', port: site.port },
                  { address: '127.0.0.1', port: crux.port },
                ],
              }),
        resolver: resolverFor(site),
        ...(crux === undefined ? {} : { crux: { apiKey: 'fixture-key', endpoint: crux.endpoint } }),
      })
      expect(schemaErrors(report)).toBe('')
      expect(report.scan).toMatchObject({ status: 'complete' })
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
    }
  })
})

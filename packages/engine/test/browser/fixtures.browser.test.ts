import { bypassesProxyForLoopback } from '@arablyzer/browser'
import { serveSite } from '@arablyzer/fixtures'
import { describe, expect, it } from 'vitest'
import { scan } from '../../src/index'
import { FIXTURE_CASES, MANUAL_RULES, RENDER_RULES } from '../fixture-cases'
import { policyFor, schemaErrors } from '../helpers'
import { enginesHere } from './engines'

// WebKit never renders on macOS (the browser package's LOOPBACK_BYPASS); CI renders it on Linux.
const engines = (await enginesHere()).filter((engine) => !bypassesProxyForLoopback(engine))
const cases = FIXTURE_CASES.filter((entry) => RENDER_RULES.has(entry.ruleId))

// The same contract as the fixtures over HTTP, rendered in every engine at once: each wrong
// fixture fails its own rule alone, and each right fixture passes every rule.
describe(`render rule fixtures (${engines.join(', ')})`, () => {
  it.each(cases)('$ruleId/$fixture', async ({ ruleId, fixture, dir, alsoFails }) => {
    const site = await serveSite(dir)
    try {
      const report = await scan(site.url('/'), {
        policy: policyFor(site),
        // Fixtures use no WebRTC, the one route that needs an isolated network.
        render: { engines, networkIsolated: true },
      })
      expect(schemaErrors(report)).toBe('')
      expect(report.scan.render?.map((run) => [run.engine, run.status])).toEqual(
        engines.map((engine) => [engine, 'rendered']),
      )
      expect(report.scan.status).toBe('complete')
      const failed = report.rules.filter((rule) => rule.status === 'fail').map((rule) => rule.id)
      const own = report.rules.find((rule) => rule.id === ruleId)?.status
      if (MANUAL_RULES.has(ruleId)) {
        // A rule that asks for review never fails: its wrong fixture has something to review,
        // its right one has nothing.
        expect(failed.sort()).toEqual([...alsoFails].sort())
        expect(own).toBe(fixture.startsWith('wrong') ? 'needs-review' : 'not-applicable')
      } else if (fixture.startsWith('wrong')) {
        expect(failed.sort()).toEqual([ruleId, ...alsoFails].sort())
      } else {
        expect(failed).toEqual([])
        expect(own).toBe('pass')
      }
    } finally {
      await site.close()
    }
  })
})

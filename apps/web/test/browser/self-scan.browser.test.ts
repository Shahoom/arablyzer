import { fileURLToPath } from 'node:url'
import { bypassesProxyForLoopback } from '@arablyzer/browser/engines'
import { createPolicy } from '@arablyzer/egress'
import { scan } from '@arablyzer/engine'
import { serveSite, type FixtureSite } from '@arablyzer/fixtures'
import type { Engine, Report } from '@arablyzer/report-schema'
import { isKnownGap } from '@arablyzer/seo/audit'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The site scanned by Arablyzer, in its three engines, as a visitor's scan would (M2.1 plan §3,
// BUILD-PLAN §6.5): every rule must pass or not apply. `pnpm test:browser` builds the site first.
const DIST = fileURLToPath(new URL('../../dist/', import.meta.url))
/**
 * The three engines, less those that never render loopback pages on this operating system
 * (WebKit on macOS, Phase 1): CI, on Linux, runs all three.
 */
const ENGINES = (['chromium', 'firefox', 'webkit'] as const).filter(
  (engine: Engine) => !bypassesProxyForLoopback(engine),
)

/**
 * Rules that judge the server rather than the pages: its scheme, certificate, HSTS header and
 * compression, which the site's server sets (Caddy, M2.1c). Staging answers them (M2.5).
 */
const SERVER_RULES = new Set([
  'https-missing',
  'hsts-missing',
  'tls-expiring',
  'text-compression-missing',
])

let site: FixtureSite

beforeAll(async () => {
  site = await serveSite(DIST)
})

afterAll(async () => {
  await site.close()
})

/** Failed or broken rules, each with its findings' messages, for a readable failure. */
function problems(report: Report) {
  return (
    report.rules
      .filter(
        (rule) => (rule.status === 'fail' || rule.status === 'error') && !SERVER_RULES.has(rule.id),
      )
      // A rule that failed only for gaps the site knows it has: the self-audit's own list.
      .filter((rule) => {
        const own = report.findings.filter((finding) => finding.ruleId === rule.id)
        return (
          rule.status === 'error' ||
          own.length === 0 ||
          !own.every((finding) => isKnownGap(finding))
        )
      })
      .map((rule) => ({
        rule: rule.id,
        status: rule.status,
        findings: report.findings
          .filter((finding) => finding.ruleId === rule.id)
          .map((finding) => `${finding.message.en} ${finding.evidence.selector ?? ''}`.trim()),
        ...(rule.error === undefined ? {} : { error: rule.error }),
      }))
  )
}

describe.each(['/', '/en/'])('Arablyzer on its own page %s', (path) => {
  it(`passes every rule in ${ENGINES.join(', ')}`, async () => {
    const report = await scan(site.url(path), {
      // The pages are served on loopback; the scan's policy opens private ranges for it alone.
      policy: createPolicy({ allowPrivate: true }),
      // CI's runner is a throwaway VM and these pages are ours, so WebKit runs there as in the
      // browser SSRF suite (M2.1 plan §3).
      render: { engines: ENGINES, networkIsolated: true },
    })
    expect(report.scan.render?.map((run) => [run.engine, run.status])).toEqual(
      ENGINES.map((engine) => [engine, 'rendered']),
    )
    expect(problems(report)).toEqual([])
    const review = report.rules.filter((rule) => rule.status === 'needs-review')
    if (review.length > 0) {
      console.info(`${path} needs review: ${review.map((rule) => rule.id).join(', ')}`)
    }
  }, 180_000)
})

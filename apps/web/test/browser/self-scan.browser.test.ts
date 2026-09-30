import { fileURLToPath } from 'node:url'
import { bypassesProxyForLoopback } from '@arablyzer/browser/engines'
import { createPolicy } from '@arablyzer/egress'
import { scan } from '@arablyzer/engine'
import { serveSite, type FixtureSite } from '@arablyzer/fixtures'
import type { Engine, Report } from '@arablyzer/report-schema'
import { builtPages, isKnownGap, representativePages } from '@arablyzer/seo/audit'
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
 * Rules that judge the server rather than the pages: its scheme, certificate and HSTS header,
 * which the site's server sets (Caddy, M2.1c); staging answers them (M2.5). The pages are served
 * compressed, as that server sends them, so the compression rule runs.
 */
const SERVER_RULES = new Set(['https-missing', 'hsts-missing', 'tls-expiring'])

/** Every page the build wrote, report pages aside: they are noindex, and audited as such. */
const PAGES = builtPages(DIST)
  .map((page) => page.path)
  .filter((path) => !/^\/(?:en\/)?r(?:\/|$)/.test(path))
/**
 * The pages that stand for the rest render in the three engines; the other tool pages, one
 * template with other words, in Chromium, which keeps the run short as the tools grow (M2.2).
 */
const EVERY_ENGINE = new Set(representativePages(builtPages(DIST)).map((page) => page.path))
const enginesFor = (path: string): Engine[] =>
  EVERY_ENGINE.has(path) ? [...ENGINES] : ['chromium']

let site: FixtureSite

beforeAll(async () => {
  site = await serveSite(DIST, { compressText: true, cleanUrls: true })
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

describe.each(PAGES)('Arablyzer on its own page %s', (path) => {
  const engines = enginesFor(path)
  it(`passes every rule in ${engines.join(', ')}`, async () => {
    const report = await scan(site.url(path), {
      // The pages are served on loopback: the policy opens that one address and port alone.
      policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
      // CI's runner is a throwaway VM and these pages are ours, so WebKit runs there as in the
      // browser SSRF suite (M2.1 plan §3).
      render: { engines, networkIsolated: true },
    })
    expect(report.scan.render?.map((run) => [run.engine, run.status])).toEqual(
      engines.map((engine) => [engine, 'rendered']),
    )
    expect(problems(report)).toEqual([])
    const review = report.rules.filter((rule) => rule.status === 'needs-review')
    if (review.length > 0) {
      console.info(`${path} needs review: ${review.map((rule) => rule.id).join(', ')}`)
    }
  }, 180_000)
})

import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bypassesProxyForLoopback } from '@arablyzer/browser/engines'
import { createPolicy } from '@arablyzer/egress'
import { scan } from '@arablyzer/engine'
import { serveSite, type FixtureSite } from '@arablyzer/fixtures'
import type { Engine, Report } from '@arablyzer/report-schema'
import { isKnownGap } from '@arablyzer/seo/audit'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The report page as a visitor sees it, rendered, scanned by Arablyzer in its three engines
// (M2.1c review): its accessibility above all, which the site's own audit, reading the empty
// shell the build writes, cannot see. The API is stood in for by fixed answers: golden report 07,
// a scan still running, and a site's opt-out. `pnpm test:browser` builds the site first.
const DIST = fileURLToPath(new URL('../../dist/', import.meta.url))
const GOLDEN = fileURLToPath(
  new URL('../../../../fixtures/golden/reports/07-checkout-form.json', import.meta.url),
)
const ENGINES = (['chromium', 'firefox', 'webkit'] as const).filter(
  (engine: Engine) => !bypassesProxyForLoopback(engine),
)
const DONE = 'DoneDoneDoneDoneDone_0'
const RUNNING = 'RunningRunningRunnin_1'
/** A tool page's scan (M2.2): the same report, shown as the tool's result, with no score. */
const TOOL = 'ToolToolToolToolTool_2'
/** A page its site asks ArablyzerBot not to check (M2.4 plan §2): the state that says so. */
const OPTED_OUT = 'OptedOutOptedOutOpte_3'

/**
 * Rules a report page fails on purpose: it is never indexed (BUILD-PLAN §6.5), and the page its
 * server sends is a shell whose heading the island draws, so a rule that reads the HTML as sent
 * finds none. Search engines never read it; a visitor, and a screen reader, get the heading.
 */
const BY_DESIGN = new Set(['page-noindex', 'h1-missing'])

let root = ''
let site: FixtureSite

const json = (value: unknown) => ({
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(value),
})
const summary = (id: string, state: string, tool?: string) => ({
  id,
  url: 'http://store.example/checkout',
  state,
  createdAt: '2026-09-28T12:00:00.000Z',
  ...(tool === undefined ? {} : { tool }),
})

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'arablyzer-report-page-'))
  await cp(DIST, root, { recursive: true })
  const page = await readFile(path.join(DIST, 'r', 'index.html'), 'utf8')
  const report = JSON.parse(await readFile(GOLDEN, 'utf8')) as Report
  const html = { headers: { 'content-type': 'text/html; charset=utf-8' }, body: page }
  // The report the engine itself gives for a site whose robots.txt opts out.
  const optOutRoot = await mkdtemp(path.join(tmpdir(), 'arablyzer-opted-out-'))
  await writeFile(path.join(optOutRoot, 'robots.txt'), 'User-agent: ArablyzerBot\nDisallow: /\n')
  const optOut = await serveSite(optOutRoot)
  const optedOut = await scan(optOut.url('/checkout'), {
    policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: optOut.port }] }),
  })
  await optOut.close()
  await rm(optOutRoot, { recursive: true, force: true })
  const events = [
    { type: 'queued', ahead: 0 },
    { type: 'started', engines: ['chromium', 'firefox'] },
    { type: 'robots', outcome: 'fetched', status: 200 },
    { type: 'page', status: 200, contentType: 'text/html', error: null },
    { type: 'crux', outcome: 'skipped' },
    { type: 'render-start', engine: 'chromium' },
  ]
  await writeFile(
    path.join(root, 'fixture.json'),
    JSON.stringify({
      [`/r/${DONE}`]: html,
      [`/r/${RUNNING}`]: html,
      [`/api/scans/${DONE}`]: json(summary(DONE, 'complete')),
      [`/api/reports/${DONE}`]: json(report),
      [`/r/${TOOL}`]: html,
      [`/api/scans/${TOOL}`]: json(summary(TOOL, 'complete', 'rtl-check')),
      [`/api/reports/${TOOL}`]: json(report),
      [`/api/scans/${RUNNING}`]: json(summary(RUNNING, 'running')),
      [`/r/${OPTED_OUT}`]: html,
      [`/api/scans/${OPTED_OUT}`]: json(summary(OPTED_OUT, 'failed')),
      [`/api/reports/${OPTED_OUT}`]: json(optedOut),
      [`/api/scans/${RUNNING}/events`]: {
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' },
        body: events
          .map((event, index) => `id: ${index + 1}\ndata: ${JSON.stringify(event)}\n\n`)
          .join(''),
      },
    }),
  )
  site = await serveSite(root, { compressText: true, cleanUrls: true })
})

afterAll(async () => {
  await site.close()
  await rm(root, { recursive: true, force: true })
})

async function scanned(id: string): Promise<Report> {
  return scan(site.url(`/r/${id}`), {
    policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
    render: { engines: ENGINES, networkIsolated: true },
  })
}

/** Failed or broken rules, less those a report page fails by design or for a known gap. */
function problems(report: Report) {
  return (
    report.rules
      .filter(
        (rule) => (rule.status === 'fail' || rule.status === 'error') && !BY_DESIGN.has(rule.id),
      )
      // A rule that failed only for gaps the site knows it has (the og:image, M2.4).
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
        findings: report.findings
          .filter((finding) => finding.ruleId === rule.id)
          .map((finding) => `${finding.message.en} ${finding.evidence.selector ?? ''}`.trim()),
      }))
  )
}

describe('the report page, rendered', () => {
  it(`shows a report that passes every rule in ${ENGINES.join(', ')}`, async () => {
    const report = await scanned(DONE)
    expect(report.scan.render?.map((run) => [run.engine, run.status])).toEqual(
      ENGINES.map((engine) => [engine, 'rendered']),
    )
    expect(problems(report)).toEqual([])
  }, 180_000)

  it(`shows a tool's result and passes every rule in ${ENGINES.join(', ')}`, async () => {
    const report = await scanned(TOOL)
    expect(problems(report)).toEqual([])
  }, 180_000)

  it(`shows a scan that runs and passes every rule in ${ENGINES.join(', ')}`, async () => {
    const report = await scanned(RUNNING)
    expect(problems(report)).toEqual([])
  }, 180_000)

  it(`shows a site's opt-out and passes every rule in ${ENGINES.join(', ')}`, async () => {
    const report = await scanned(OPTED_OUT)
    expect(problems(report)).toEqual([])
  }, 180_000)
})

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { ScanEvent } from '@arablyzer/api-contract/codes'
import { createPolicy } from '@arablyzer/egress'
import { scan } from '@arablyzer/engine'
import { serveSite } from '@arablyzer/fixtures'
import checkoutFormJson from '@arablyzer/fixtures/golden/reports/07-checkout-form.json'
import rtlLayoutJson from '@arablyzer/fixtures/golden/reports/04-rtl-layout.json'
import { REPORT } from '@arablyzer/i18n/report'
import { Report } from '@arablyzer/report-schema'
import { describe, expect, it } from 'vitest'
import { idFromPath } from '../src/islands/ReportApp'
import {
  advance,
  optOutOf,
  outcomeOf,
  problemsOf,
  START,
  stepsOf,
  type Progress,
} from '../src/islands/report-model'

const rtlLayout = Report.parse(rtlLayoutJson)

/** The report the engine gives for a page its site asks ArablyzerBot not to check (M2.4 plan §2). */
async function optedOut(): Promise<Report> {
  const root = await mkdtemp(path.join(tmpdir(), 'arablyzer-opt-out-'))
  await writeFile(path.join(root, 'robots.txt'), 'User-agent: ArablyzerBot\nDisallow: /x\n')
  const site = await serveSite(root)
  try {
    return await scan(site.url('/x'), {
      policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
    })
  } finally {
    await site.close()
    await rm(root, { recursive: true, force: true })
  }
}

describe('advance', () => {
  it('folds a scan’s events into what the progress page shows', () => {
    const events: ScanEvent[] = [
      { type: 'queued', ahead: 1 },
      { type: 'started', engines: ['firefox', 'chromium'] },
      { type: 'robots', outcome: 'fetched', status: 200 },
      { type: 'page', status: 200, contentType: 'text/html', error: null },
      // The site a redirect led to has its own robots.txt: the latest one read is shown.
      { type: 'robots', outcome: 'unavailable', status: 404 },
      { type: 'crux', outcome: 'skipped' },
      { type: 'render-start', engine: 'chromium' },
      {
        type: 'render',
        engine: 'chromium',
        version: '153.0.8010.12',
        status: 'rendered',
        requests: { total: 1, refused: 0 },
      },
      { type: 'render-start', engine: 'firefox' },
    ]
    const progress = events.reduce(advance, START)
    expect(progress.queued).toBe(1)
    expect(progress.started).toBe(true)
    expect(progress.planned).toEqual(['chromium', 'firefox'])
    expect(progress.page?.status).toBe(200)
    expect(progress.robots?.outcome).toBe('unavailable')
    expect(progress.engines).toEqual({
      chromium: { state: 'rendered', version: '153.0.8010.12', requests: 1 },
      firefox: { state: 'rendering', version: null, requests: null },
      webkit: { state: 'waiting', version: null, requests: null },
    })
    expect(progress.enginesDone).toBe(1)
    const finished = advance(advance(progress, { type: 'rules', rules: 47 }), {
      type: 'done',
      state: 'complete',
    })
    expect([finished.rules, finished.done?.state]).toEqual([47, 'complete'])
    expect(advance(START, { type: 'error' }).error).toBe(true)
  })

  it('knows no engine before the scan names them, and counts engines, not events', () => {
    expect(START.planned).toEqual([])
    const render: ScanEvent = {
      type: 'render',
      engine: 'chromium',
      version: '153',
      status: 'rendered',
      requests: { total: 1, refused: 0 },
    }
    // The same render, twice, as a stream replayed without its progress reset would give it.
    expect([render, render].reduce(advance, START).enginesDone).toBe(1)
  })
})

const t = REPORT.en.progress
const steps = (progress: Progress) =>
  stepsOf(progress, t).map((step) => [step.key, step.state, step.detail])
const fold = (events: ScanEvent[]) => events.reduce(advance, START)

describe('stepsOf', () => {
  it('waits, all of it, until the scan starts', () => {
    expect(steps(fold([{ type: 'queued', ahead: 2 }])).map(([, state]) => state)).toEqual([
      'waiting',
      'waiting',
      'waiting',
      'waiting',
      'waiting',
      'waiting',
    ])
  })

  it('follows the engine: one step at a time, readings as they come, robots.txt first', () => {
    const started: ScanEvent[] = [
      { type: 'started', engines: ['chromium', 'firefox'] },
      { type: 'robots', outcome: 'fetched', status: 200 },
    ]
    expect(steps(fold(started))).toEqual([
      ['robots', 'done', 'Read'],
      ['page', 'active', null],
      ['crux', 'waiting', null],
      ['render', 'waiting', '0 / 2'],
      ['rules', 'waiting', null],
      ['score', 'waiting', null],
    ])
    expect(
      steps(
        fold([
          ...started,
          { type: 'page', status: 200, contentType: 'text/html; charset=utf-8', error: null },
        ]),
      ).slice(0, 3),
    ).toEqual([
      ['robots', 'done', 'Read'],
      ['page', 'done', '200 · text/html'],
      ['crux', 'active', null],
    ])
  })

  it('drops the steps a scan has no use for once a later one began', () => {
    const shown = steps(
      fold([
        { type: 'started', engines: [] },
        { type: 'robots', outcome: 'unavailable', status: 404 },
        { type: 'page', status: 200, contentType: 'text/html', error: null },
        { type: 'rules', rules: 47 },
      ]),
    ).map(([key]) => key)
    expect(shown).toEqual(['robots', 'page', 'rules', 'score'])
  })

  it('shows a page that could not be fetched as failed, not done', () => {
    expect(
      steps(
        fold([
          { type: 'started', engines: ['chromium'] },
          { type: 'robots', outcome: 'unreachable', status: null },
          { type: 'page', status: null, contentType: null, error: 'connect-failed' },
        ]),
      ).slice(0, 2),
    ).toEqual([
      ['robots', 'done', 'Could not be reached'],
      ['page', 'failed', 'Could not be fetched'],
    ])
  })

  it('drops robots.txt when the page came without it: a URL refused before any lookup', () => {
    expect(
      steps(
        fold([
          { type: 'started', engines: [] },
          { type: 'page', status: null, contentType: null, error: 'blocked-host' },
        ]),
      )[0],
    ).toEqual(['page', 'failed', 'Could not be fetched'])
  })
})

describe('idFromPath', () => {
  it('reads the ID from a report link, in either language, and nothing else', () => {
    expect(idFromPath('/r/AbCdEfGhIjKlMnOpQrSt_-')).toBe('AbCdEfGhIjKlMnOpQrSt_-')
    expect(idFromPath('/en/r/AbCdEfGhIjKlMnOpQrSt_-/')).toBe('AbCdEfGhIjKlMnOpQrSt_-')
    expect(idFromPath('/r/')).toBeNull()
    expect(idFromPath('/r/short')).toBeNull()
    expect(idFromPath('/r/AbCdEfGhIjKlMnOpQrSt_-x')).toBeNull()
  })
})

describe('outcomeOf', () => {
  it('reads a whole report as complete, and a refusal as blocked', () => {
    expect(outcomeOf(rtlLayout)).toBe('complete')
    const refused = {
      ...rtlLayout,
      target: { ...rtlLayout.target, http: { ...rtlLayout.target.http, status: 403 } },
    }
    expect(outcomeOf(refused)).toBe('blocked')
    const partial = { ...rtlLayout, scan: { ...rtlLayout.scan, status: 'partial' as const } }
    expect(outcomeOf(partial)).toBe('partial')
  })

  it('reads a site’s opt-out as that, whatever the page answered on the way', async () => {
    const report = await optedOut()
    expect(outcomeOf(report)).toBe('opted-out')
    // A redirect that answered 403 before the next site's robots.txt said no.
    const refused = {
      ...report,
      target: { ...report.target, http: { ...report.target.http, status: 403 } },
    }
    expect(outcomeOf(refused)).toBe('opted-out')
    expect(optOutOf(report)?.message.en).toContain('“Disallow: /x” is on line 2')
    expect(optOutOf(rtlLayout)).toBeNull()
  })
})

describe('problemsOf', () => {
  it('lists failed rules most severe first, each with its findings', () => {
    expect(problemsOf(rtlLayout).map(({ rule, findings }) => [rule.id, findings.length])).toEqual([
      ['rtl-horizontal-overflow', 1],
      ['ar-letter-spacing', 1],
      ['rtl-physical-css', 1],
    ])
    const form = Report.parse(checkoutFormJson)
    expect(problemsOf(form).map(({ rule }) => rule.severity)).toEqual([
      'critical',
      'serious',
      'moderate',
      'moderate',
    ])
  })
})

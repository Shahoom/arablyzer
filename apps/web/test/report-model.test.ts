import type { ScanEvent } from '@arablyzer/api-contract/codes'
import checkoutFormJson from '@arablyzer/fixtures/golden/reports/07-checkout-form.json'
import rtlLayoutJson from '@arablyzer/fixtures/golden/reports/04-rtl-layout.json'
import { REPORT } from '@arablyzer/i18n/report'
import { Report } from '@arablyzer/report-schema'
import { describe, expect, it } from 'vitest'
import { idFromPath } from '../src/islands/ReportApp'
import {
  advance,
  outcomeOf,
  problemsOf,
  START,
  stepsOf,
  type Progress,
} from '../src/islands/report-model'

const rtlLayout = Report.parse(rtlLayoutJson)

describe('advance', () => {
  it('folds a scan’s events into what the progress page shows', () => {
    const events: ScanEvent[] = [
      { type: 'queued', ahead: 1 },
      { type: 'started', engines: ['firefox', 'chromium'] },
      { type: 'page', status: 200, contentType: 'text/html', error: null },
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

  it('follows the engine: one step at a time, readings as they come', () => {
    expect(
      steps(
        fold([
          { type: 'started', engines: ['chromium', 'firefox'] },
          { type: 'page', status: 200, contentType: 'text/html; charset=utf-8', error: null },
          { type: 'robots', outcome: 'fetched', status: 200 },
        ]),
      ),
    ).toEqual([
      ['page', 'done', '200 · text/html'],
      ['robots', 'done', 'Read'],
      ['crux', 'active', null],
      ['render', 'waiting', '0 / 2'],
      ['rules', 'waiting', null],
      ['score', 'waiting', null],
    ])
  })

  it('drops the steps a scan has no use for once a later one began', () => {
    const shown = steps(
      fold([
        { type: 'started', engines: [] },
        { type: 'page', status: 200, contentType: 'text/html', error: null },
        { type: 'rules', rules: 47 },
      ]),
    ).map(([key]) => key)
    expect(shown).toEqual(['page', 'rules', 'score'])
  })

  it('shows a page that could not be fetched as failed, not done', () => {
    expect(
      steps(
        fold([
          { type: 'started', engines: ['chromium'] },
          { type: 'page', status: null, contentType: null, error: 'connect-failed' },
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

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { ScanEvent } from '@arablyzer/api-contract/codes'
import { createPolicy } from '@arablyzer/egress'
import { REFUSAL_STATUSES, scan } from '@arablyzer/engine'
import { serveSite } from '@arablyzer/fixtures'
import checkoutFormJson from '@arablyzer/fixtures/golden/reports/07-checkout-form.json'
import rtlLayoutJson from '@arablyzer/fixtures/golden/reports/04-rtl-layout.json'
import { REPORT } from '@arablyzer/i18n/report'
import { TOOL_APP } from '@arablyzer/i18n/tool-app'
import { Report, type RuleStatus } from '@arablyzer/report-schema'
import { describe, expect, it } from 'vitest'
import { idFromPath } from '../src/islands/ReportApp'
import {
  advance,
  optOutOf,
  outcomeOf,
  REFUSALS,
  problemCount,
  problemsOf,
  START,
  stepsOf,
  noProblemsNote,
  noteCount,
  toolHeadline,
  toolVerdict,
  worstProblem,
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
      // A redirect to another site: its robots.txt comes before its page, and the latest one
      // read is shown.
      { type: 'robots', outcome: 'unavailable', status: 404 },
      { type: 'page', status: 200, contentType: 'text/html', error: null },
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

  // M2.3c review: the engine leaves a link unjudged for the answers by which a site refuses a bot,
  // and the report page reads them as the site refusing the scan: the same five.
  it('reads as a refusal the statuses by which the engine leaves a link unjudged', () => {
    expect([...REFUSALS].sort()).toEqual([...REFUSAL_STATUSES].sort())
    for (const status of REFUSAL_STATUSES) {
      const refused = {
        ...rtlLayout,
        target: { ...rtlLayout.target, http: { ...rtlLayout.target.http, status } },
      }
      expect(outcomeOf(refused), String(status)).toBe('blocked')
    }
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

/**
 * Golden report 04 as the RTL checker's scan gives it (M2.2): its two rules alone, with these
 * statuses, and the scan as given.
 */
function rtlCheck(
  statuses: readonly [RuleStatus, RuleStatus],
  scan: Partial<Report['scan']> = {},
): Report {
  const ids = ['rtl-html-dir', 'ar-html-lang']
  return {
    ...rtlLayout,
    scan: { ...rtlLayout.scan, ...scan },
    rules: ids.map((id, index) => {
      const rule = rtlLayout.rules.find((candidate) => candidate.id === id)
      if (rule === undefined) throw new Error(id)
      const status = statuses[index] ?? 'pass'
      return { ...rule, status, ...(status === 'error' ? { error: 'page-unavailable' } : {}) }
    }),
    findings: [],
  }
}

describe('toolVerdict', () => {
  it('says the page passes when every rule that applies passed, in a whole scan', () => {
    expect(toolVerdict(rtlCheck(['pass', 'pass']))).toBe('passed')
    expect(toolVerdict(rtlCheck(['pass', 'not-applicable']))).toBe('passed')
  })

  it('says there are problems when a rule failed, even in a scan that did not finish', () => {
    expect(toolVerdict(rtlCheck(['fail', 'pass']))).toBe('problems')
    expect(toolVerdict(rtlCheck(['fail', 'error'], { status: 'partial' }))).toBe('problems')
  })

  it('says the site asked not to be checked, before anything else', () => {
    const optedOut = rtlCheck(['error', 'error'], {
      status: 'failed',
      notices: [
        {
          code: 'opted-out',
          message: {
            ar: 'يطلب ملف robots.txt ألّا نفحص الصفحة.',
            en: 'robots.txt asks us not to.',
          },
        },
      ],
    })
    expect(toolVerdict({ ...optedOut, page: null })).toBe('opted-out')
  })

  it('never says a scan that did not finish passes', () => {
    // A rule that could not run, in a partial scan.
    expect(toolVerdict(rtlCheck(['error', 'pass'], { status: 'partial' }))).toBe('incomplete')
    // A failed scan: the page could not be fetched, and no rule ran.
    const failed = rtlCheck(['error', 'error'], {
      status: 'failed',
      notices: [
        { code: 'connect-failed', message: { ar: 'تعذّر الاتصال.', en: 'Could not connect.' } },
      ],
    })
    expect(toolVerdict({ ...failed, page: null })).toBe('incomplete')
    // Every rule passed, but the scan says it is partial (a browser did not render).
    expect(toolVerdict(rtlCheck(['pass', 'pass'], { status: 'partial' }))).toBe('incomplete')
    // A rule that could not run, whatever the scan says.
    expect(toolVerdict(rtlCheck(['pass', 'error']))).toBe('incomplete')
  })

  it('asks for a review when a rule needs one and nothing failed', () => {
    expect(toolVerdict(rtlCheck(['needs-review', 'pass']))).toBe('review')
    expect(toolVerdict(rtlCheck(['needs-review', 'error']))).toBe('incomplete')
  })

  it('says the check does not apply when no rule applied, and when the site refused it', () => {
    expect(toolVerdict(rtlCheck(['not-applicable', 'not-applicable']))).toBe('not-applicable')
    const refused = rtlCheck(['not-applicable', 'not-applicable'])
    expect(
      toolVerdict({
        ...refused,
        target: { ...refused.target, http: { ...refused.target.http, status: 403 } },
      }),
    ).toBe('blocked')
  })
})

describe('problemCount', () => {
  it('counts every finding of the failed rules that judge, those the report left out too', () => {
    // Golden report 04: three rules failed, with a finding each; one of them only lists.
    expect(problemCount(rtlLayout)).toBe(2)
    const capped = {
      ...rtlLayout,
      rules: rtlLayout.rules.map((rule) =>
        rule.id === 'rtl-horizontal-overflow' ? { ...rule, findingsOmitted: 17 } : rule,
      ),
    }
    expect(problemCount(capped)).toBe(19)
  })

  it('counts a failed rule without findings once, and nothing for a review', () => {
    expect(problemCount(rtlCheck(['fail', 'pass']))).toBe(1)
    expect(problemCount(rtlCheck(['needs-review', 'pass']))).toBe(0)
  })
})

describe('noProblemsNote', () => {
  it('says the rules found nothing only when every rule finished', () => {
    expect(noProblemsNote(rtlCheck(['pass', 'not-applicable']))).toBe('none')
    expect(noProblemsNote(rtlCheck(['pass', 'needs-review']))).toBe('none')
  })

  it('says some rules did not finish, when some did', () => {
    expect(noProblemsNote(rtlCheck(['pass', 'error'], { status: 'partial' }))).toBe('incomplete')
  })

  it('says nothing can be said when no rule finished', () => {
    expect(noProblemsNote(rtlCheck(['error', 'error'], { status: 'failed' }))).toBe('unknown')
  })
})

/**
 * Golden report 04 with only these rules, each with this status and its findings: the report of a
 * tool that runs them. Its rtl-physical-css is information (severity info), the others judge.
 */
function ruleset(
  statuses: Readonly<Record<string, RuleStatus>>,
  scan: Partial<Report['scan']> = {},
) {
  const rules = Object.entries(statuses).map(([id, status]) => {
    const rule = rtlLayout.rules.find((candidate) => candidate.id === id)
    if (rule === undefined) throw new Error(id)
    return { ...rule, status, ...(status === 'error' ? { error: 'page-unavailable' } : {}) }
  })
  return {
    ...rtlLayout,
    scan: { ...rtlLayout.scan, ...scan },
    rules,
    findings: rtlLayout.findings.filter((finding) => statuses[finding.ruleId] === 'fail'),
  }
}

// M2.3c review: a finding of an information rule made the rule fail, and the tool counted it as a
// problem: payment-methods-detector said "3 problems to fix" for a store showing mada, Apple Pay
// and Tabby, and "passes" for one showing none. Information is noted, never a problem.
describe('information rules’ findings', () => {
  const noted = ruleset({ 'rtl-html-dir': 'pass', 'rtl-physical-css': 'fail' })
  const both = ruleset({ 'rtl-horizontal-overflow': 'fail', 'rtl-physical-css': 'fail' })

  it('are notes, and not problems', () => {
    expect(rtlLayout.rules.find((rule) => rule.id === 'rtl-physical-css')?.severity).toBe('info')
    expect([problemCount(noted), noteCount(noted)]).toEqual([0, 1])
    expect([problemCount(both), noteCount(both)]).toEqual([1, 1])
    // Golden report 04: two rules that judge failed, and one that lists.
    expect([problemCount(rtlLayout), noteCount(rtlLayout)]).toEqual([2, 1])
  })

  it('count those the report left out past its cap, as problems do', () => {
    const capped = {
      ...noted,
      rules: noted.rules.map((rule) =>
        rule.id === 'rtl-physical-css' ? { ...rule, findingsOmitted: 17 } : rule,
      ),
    }
    expect([problemCount(capped), noteCount(capped)]).toEqual([0, 18])
  })

  it('give no worst severity, no more than a fix', () => {
    expect(worstProblem(noted)).toBeUndefined()
    expect(worstProblem(both)).toBe('serious')
    expect(worstProblem(rtlLayout)).toBe('serious')
  })

  it('make a verdict of their own, after every problem, unfinished rule and review', () => {
    expect(toolVerdict(noted)).toBe('noted')
    expect(toolVerdict(both)).toBe('problems')
    expect(toolVerdict(ruleset({ 'rtl-physical-css': 'fail', 'rtl-html-dir': 'error' }))).toBe(
      'incomplete',
    )
    expect(
      toolVerdict(ruleset({ 'rtl-physical-css': 'fail', 'rtl-html-dir': 'needs-review' })),
    ).toBe('review')
    expect(toolVerdict(ruleset({ 'rtl-physical-css': 'fail' }, { status: 'partial' }))).toBe(
      'incomplete',
    )
  })

  it('leave "none found" for a tool of information rules that found none, and "passes" for the rest', () => {
    const none = ruleset({ 'rtl-physical-css': 'pass' })
    expect(toolVerdict(none, true)).toBe('none-found')
    expect(toolVerdict(none)).toBe('passed')
    expect(toolVerdict(noted, true)).toBe('noted')
    // A tool that judges, with a rule that lists among them, still says its page passes.
    expect(toolVerdict(ruleset({ 'rtl-html-dir': 'pass', 'rtl-physical-css': 'pass' }))).toBe(
      'passed',
    )
  })
})

describe('toolHeadline', () => {
  const noted = ruleset({ 'rtl-html-dir': 'pass', 'rtl-physical-css': 'fail' })
  const many = {
    ...noted,
    rules: noted.rules.map((rule) =>
      rule.id === 'rtl-physical-css' ? { ...rule, findingsOmitted: 2 } : rule,
    ),
  }

  it('counts problems that judge, in both languages', () => {
    const both = ruleset({ 'rtl-horizontal-overflow': 'fail', 'rtl-physical-css': 'fail' })
    expect(toolHeadline(both, TOOL_APP.en.result)).toBe('1 problem to fix')
    expect(toolHeadline(rtlLayout, TOOL_APP.en.result)).toBe('2 problems to fix')
    expect(toolHeadline(rtlLayout, TOOL_APP.ar.result)).toBe('مشكلتان تحتاجان إصلاحاً')
  })

  it('counts what an information rule found as notes, not problems', () => {
    expect(toolHeadline(noted, TOOL_APP.en.result)).toBe('1 note, not a problem')
    expect(toolHeadline(many, TOOL_APP.en.result)).toBe('3 notes, not problems')
    expect(toolHeadline(noted, TOOL_APP.ar.result)).toBe('ملاحظة واحدة، وليست مشكلة')
    expect(toolHeadline(many, TOOL_APP.ar.result)).toBe('3 ملاحظات، وليست مشكلات')
    for (const lang of ['ar', 'en'] as const) {
      expect(toolHeadline(many, TOOL_APP[lang].result)).not.toBe(TOOL_APP[lang].result.problems(3))
    }
  })

  it('says nothing was found, not that the page passes, for a tool of information rules', () => {
    const none = ruleset({ 'rtl-physical-css': 'pass' })
    expect(toolHeadline(none, TOOL_APP.en.result, true)).toBe('Nothing found on the page')
    expect(toolHeadline(none, TOOL_APP.ar.result, true)).toBe('لم نجد شيئاً في الصفحة')
    expect(toolHeadline(none, TOOL_APP.en.result)).toBe('The page passes this check')
  })

  it('keeps the other verdicts’ words', () => {
    const t = TOOL_APP.en.result
    expect(toolHeadline(ruleset({ 'rtl-html-dir': 'error' }, { status: 'partial' }), t)).toBe(
      t.incomplete,
    )
    expect(toolHeadline(ruleset({ 'rtl-html-dir': 'not-applicable' }), t)).toBe(t.notApplicable)
    expect(toolHeadline(ruleset({ 'rtl-html-dir': 'needs-review' }), t)).toBe(t.review)
  })
})

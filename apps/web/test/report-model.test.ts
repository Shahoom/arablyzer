import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { ScanEvent } from '@arablyzer/api-contract/codes'
import { createPolicy } from '@arablyzer/egress'
import { REFUSAL_STATUSES, scan } from '@arablyzer/engine'
import { serveSite } from '@arablyzer/fixtures'
import checkoutFormJson from '@arablyzer/fixtures/golden/reports/07-checkout-form.json'
import cleanStoreJson from '@arablyzer/fixtures/golden/reports/01-clean-store.json'
import rtlLayoutJson from '@arablyzer/fixtures/golden/reports/04-rtl-layout.json'
import { REPORT } from '@arablyzer/i18n/report'
import { TOOL_APP } from '@arablyzer/i18n/tool-app'
import { Report, type RuleStatus } from '@arablyzer/report-schema'
import { describe, expect, it } from 'vitest'
import {
  advance,
  aloneEngines,
  bandOf,
  categoryRows,
  checklistOf,
  diagramOf,
  headlineOf,
  idFromPath,
  listOf,
  onlyEngine,
  optOutOf,
  outcomeOf,
  REFUSALS,
  problemCount,
  problemsOf,
  renderedEngines,
  START,
  stateNotices,
  stepsOf,
  summaryCounts,
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
    // A bot challenge, whatever its status: AWS WAF's answers 202.
    const challenged: Report = {
      ...rtlLayout,
      target: { ...rtlLayout.target, http: { ...rtlLayout.target.http, status: 202 } },
      scan: {
        ...rtlLayout.scan,
        notices: [{ code: 'bot-challenge', message: { ar: 'تحدٍّ', en: 'A challenge' } }],
      },
    }
    expect(outcomeOf(challenged)).toBe('blocked')
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

describe('stateNotices', () => {
  const challenge = {
    code: 'bot-challenge',
    message: { ar: 'تحدٍّ من Cloudflare', en: 'A challenge' },
  }
  const other = { code: 'render-skipped', message: { ar: 'لم يُعرض', en: 'Not rendered' } }
  const withNotices = (notices: Report['scan']['notices']): Report => ({
    ...rtlLayout,
    scan: { ...rtlLayout.scan, notices },
  })

  // M2.3c review: the copy of bot-challenge says the report shows the challenge, but the card of a
  // site that blocked the scan showed no notice at all.
  it('shows a blocked scan the challenge that blocked it, and none of the others', () => {
    const blocked = withNotices([other, challenge])
    expect(stateNotices('blocked', blocked)).toEqual([challenge])
    // A refusal without a challenge has nothing to add to what the card says of the status.
    expect(stateNotices('blocked', withNotices([other]))).toEqual([])
  })

  it('shows the other states every notice: an opt-out’s names the site’s rule', () => {
    const notices = [other, challenge]
    for (const outcome of ['opted-out', 'failed', 'partial', 'complete'] as const) {
      expect(stateNotices(outcome, withNotices(notices)), outcome).toEqual(notices)
    }
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

const cleanStore = Report.parse(cleanStoreJson)
const checkoutForm = Report.parse(checkoutFormJson)

// M2.6 R4: the summary of the report, counted from the rules' results as the report's own summary
// counts them.
describe('summaryCounts', () => {
  it('counts the failed rules by severity, as the report’s own summary does', () => {
    for (const report of [rtlLayout, checkoutForm, cleanStore]) {
      expect(summaryCounts(report).bySeverity).toEqual(report.summary.bySeverity)
    }
  })

  it('takes the rules that judge for problems, the rules that only list for notes', () => {
    // Golden report 04: a serious and a moderate rule failed, and one that only lists (info).
    expect(summaryCounts(rtlLayout)).toMatchObject({ problems: 2, notes: 1, review: 0 })
    expect(summaryCounts(checkoutForm)).toMatchObject({ problems: 4, notes: 0, review: 0 })
    expect(summaryCounts(cleanStore)).toMatchObject({ problems: 0, notes: 0, review: 0 })
  })

  it('counts a rule that needs a review as neither', () => {
    expect(summaryCounts(rtlCheck(['needs-review', 'pass']))).toMatchObject({
      problems: 0,
      notes: 0,
      review: 1,
    })
  })
})

describe('headlineOf', () => {
  it('counts the problems and notes when there are any', () => {
    expect(headlineOf(rtlLayout)).toEqual({ kind: 'counts', problems: 2, notes: 1 })
    expect(headlineOf(rtlCheck(['fail', 'pass']))).toEqual({
      kind: 'counts',
      problems: 1,
      notes: 0,
    })
  })

  it('asks for a review when that is all there is', () => {
    expect(headlineOf(rtlCheck(['needs-review', 'pass']))).toEqual({ kind: 'review', count: 1 })
  })

  it('says the page is clean only as far as the rules that ran can say it', () => {
    expect(headlineOf(cleanStore)).toEqual({ kind: 'clean' })
    expect(headlineOf(rtlCheck(['pass', 'error'], { status: 'partial' }))).toEqual({
      kind: 'incomplete',
    })
    expect(headlineOf(rtlCheck(['error', 'error'], { status: 'failed' }))).toEqual({
      kind: 'unknown',
    })
  })
})

describe('bandOf', () => {
  it('draws Lighthouse’s cut-offs: 90 and 50', () => {
    expect([100, 90, 89, 67, 50, 49, 0].map(bandOf)).toEqual([
      'good',
      'good',
      'mid',
      'mid',
      'mid',
      'low',
      'low',
    ])
  })
})

describe('categoryRows', () => {
  it('groups the categories: under 100 lowest first, at 100, and those no rule applied to', () => {
    // Golden report 04: the Arabic rendering is at 0 and the direction at 72.
    expect(categoryRows(rtlLayout.score.categories)).toEqual({
      low: [
        { category: 'ar-render', value: 0 },
        { category: 'rtl', value: 72 },
      ],
      full: ['ar-content', 'onpage', 'index', 'crawl', 'links', 'intl', 'speed', 'trust', 'ai'],
      none: ['forms', 'locale', 'schema', 'commerce'],
    })
  })

  it('keeps the order of the categories among equal scores, and lists only those the report has', () => {
    const rows = categoryRows({ forms: 50, rtl: 50, speed: null })
    expect(rows.low.map((row) => row.category)).toEqual(['rtl', 'forms'])
    expect(rows.none).toEqual(['speed'])
    expect(rows.full).toEqual([])
    expect(categoryRows({})).toEqual({ low: [], full: [], none: [] })
  })
})

describe('the engines of a report', () => {
  it('names those that rendered, in the order a scan renders them', () => {
    expect(renderedEngines(rtlLayout)).toEqual(['chromium', 'firefox', 'webkit'])
    expect(renderedEngines(cleanStore)).toEqual([])
    const withFailure = {
      ...rtlLayout,
      scan: {
        ...rtlLayout.scan,
        render: rtlLayout.scan.render?.map((run) =>
          run.engine === 'firefox' ? { ...run, status: 'timeout' as const } : run,
        ),
      },
    }
    expect(renderedEngines(withFailure)).toEqual(['chromium', 'webkit'])
  })

  it('finds the engine that shows a problem the others do not', () => {
    // Golden report 04: the letter-spacing is drawn by WebKit alone.
    expect([...aloneEngines(rtlLayout)]).toEqual(['webkit'])
    expect([...aloneEngines(cleanStore)]).toEqual([])
    // With one engine rendered, there is no other to compare it with.
    const one = {
      ...rtlLayout,
      scan: { ...rtlLayout.scan, render: rtlLayout.scan.render?.slice(0, 1) },
    }
    expect([...aloneEngines(one)]).toEqual([])
  })

  it('says a rule is one browser’s only when every finding of it was seen there alone', () => {
    const [spacing] = rtlLayout.findings.filter((finding) => finding.ruleId === 'ar-letter-spacing')
    const [overflow] = rtlLayout.findings.filter(
      (finding) => finding.ruleId === 'rtl-horizontal-overflow',
    )
    if (spacing === undefined || overflow === undefined) throw new Error('golden report 04')
    expect(onlyEngine([spacing], 3)).toBe('webkit')
    expect(onlyEngine([overflow], 3)).toBeNull()
    expect(onlyEngine([spacing, overflow], 3)).toBeNull()
    expect(onlyEngine([spacing], 1)).toBeNull()
    expect(onlyEngine([], 3)).toBeNull()
    const fromHtml = { ...spacing, evidence: { ...spacing.evidence, engines: undefined } }
    expect(onlyEngine([fromHtml as typeof spacing], 3)).toBeNull()
  })

  it('lists names as each language does', () => {
    expect(listOf(['Chromium', 'Firefox', 'WebKit'], 'ar')).toBe('Chromium وFirefox وWebKit')
    expect(listOf(['Chromium', 'Firefox'], 'ar')).toBe('Chromium وFirefox')
    expect(listOf(['Chromium'], 'ar')).toBe('Chromium')
    expect(listOf(['Chromium', 'Firefox', 'WebKit'], 'en')).toBe('Chromium, Firefox, and WebKit')
    expect(listOf(['Chromium', 'Firefox'], 'en')).toBe('Chromium and Firefox')
    expect(listOf(['Chromium'], 'en')).toBe('Chromium')
    expect(listOf([], 'en')).toBe('')
  })

  // WebKit's Intl.ListFormat puts U+2068 and U+2069 around each name of an Arabic list: the page
  // showed them as «⟨U+2068⟩» in Safari, so the lists are written out.
  it('writes no bidi control into a list', () => {
    for (const lang of ['ar', 'en'] as const) {
      expect(listOf(['Chromium', 'Firefox', 'WebKit'], lang)).not.toMatch(
        /[\u2066-\u2069\u200e\u200f]/u,
      )
    }
  })
})

describe('checklistOf', () => {
  it('tells a finished scan as the progress page told it running, each step done', () => {
    // Golden report 04: robots.txt answered 404, the page 200, three engines rendered 69 rules.
    expect(
      checklistOf(rtlLayout, t).map((step) => [step.key, step.state, step.detail, step.ltr]),
    ).toEqual([
      ['robots', 'done', '404', true],
      ['page', 'done', '200 · text/html', true],
      ['render', 'done', '3 / 3', true],
      ['rules', 'done', '69 rules', false],
    ])
    // The same keys, in the same order, as the steps of a scan running.
    const running = stepsOf(
      fold([
        { type: 'started', engines: ['chromium', 'firefox', 'webkit'] },
        { type: 'robots', outcome: 'fetched', status: 200 },
        { type: 'page', status: 200, contentType: 'text/html', error: null },
        { type: 'render-start', engine: 'chromium' },
      ]),
      t,
    ).map((step) => step.key)
    const finished = checklistOf(rtlLayout, t).map((step) => step.key)
    expect(running.filter((key) => finished.includes(key))).toEqual(finished)
  })

  it('leaves out what the report holds nothing of, and shows a page that was not fetched', () => {
    // The clean store's scan did not render, but CrUX answered.
    expect(checklistOf(cleanStore, t).map((step) => step.key)).toEqual([
      'robots',
      'page',
      'crux',
      'rules',
    ])
    const noPage = {
      ...cleanStore,
      facts: {},
      target: { ...cleanStore.target, http: { ...cleanStore.target.http, status: null } },
    }
    expect(checklistOf(noPage, t).map((step) => [step.key, step.state])).toEqual([
      ['page', 'failed'],
      ['rules', 'done'],
    ])
  })

  it('shows the browsers that did not render, and CrUX when the report has its fact', () => {
    const none = {
      ...rtlLayout,
      scan: {
        ...rtlLayout.scan,
        render: rtlLayout.scan.render?.map((run) => ({ ...run, status: 'failed' as const })),
      },
      facts: {
        ...rtlLayout.facts,
        crux: {
          outcome: 'not-found' as const,
          scope: null,
          key: null,
          period: null,
          lcp: null,
          inp: null,
          cls: null,
        },
      },
    }
    const steps = checklistOf(none, t)
    expect(steps.find((step) => step.key === 'render')).toMatchObject({
      state: 'failed',
      detail: '0 / 3',
    })
    expect(steps.find((step) => step.key === 'crux')).toMatchObject({
      state: 'done',
      detail: 'No CrUX data for it',
    })
  })
})

describe('diagramOf', () => {
  it('draws an element past the screen’s left edge to scale: golden report 04’s menu', () => {
    // A 390 px screen is 150 units; the nav starts 280 px left of it and is 260 px wide.
    const diagram = diagramOf(-280, 260, 390)
    expect(diagram.screen).toEqual({ x: 300, width: 150 })
    expect(diagram.start).toBeCloseTo(192.3, 1)
    expect(diagram.end).toBeCloseTo(292.3, 1)
    // The drawing is cropped to the box and the screen, a margin each side.
    expect([diagram.from, diagram.to]).toEqual([178, 464])
  })

  it('keeps the whole screen in the drawing when the element runs past its right edge', () => {
    const diagram = diagramOf(300, 400, 390)
    expect(diagram.end).toBe(516)
    expect([diagram.from, diagram.to]).toEqual([286, 520])
  })

  it('never draws outside its 520 units, however far the element is', () => {
    const far = diagramOf(-2000, 100, 390)
    expect([far.start, far.from]).toEqual([4, 0])
    expect(far.end).toBeGreaterThan(far.start)
    const wide = diagramOf(0, 100_000, 390)
    expect(wide.to).toBeLessThanOrEqual(520)
    expect(wide.end).toBeLessThanOrEqual(516)
  })
})

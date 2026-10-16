import { Engine, KEBAB_ID, type Report, type RuleStatus } from '@arablyzer/report-schema'
import { z } from 'zod'

/** What is kept of a rule's result: one letter. */
export const RULE_CODE = {
  pass: 'p',
  fail: 'f',
  'needs-review': 'r',
  'not-applicable': 'n',
  error: 'e',
} as const satisfies Record<RuleStatus, string>
export type RuleCode = (typeof RULE_CODE)[RuleStatus]

const Milliseconds = z.number().nonnegative().nullable()

/**
 * What the crawl keeps of one homepage (docs/design/plans/m9-state-of-arabic-web.md §3): a letter for
 * each rule the scan ran, and a few facts. No address but the domain it is stored under, no title,
 * no text, no screenshot, no finding's evidence: nothing that names or shows the site's content.
 */
export const Outcome = z.strictObject({
  v: z.literal(1),
  /** The page was fetched and judged: a score exists. A bot challenge or an error page is not it. */
  reached: z.boolean(),
  status: z.enum(['complete', 'partial', 'failed']),
  /** Chromium (or another engine) drew the page, so the rules that read the rendering ran. */
  rendered: z.boolean(),
  engines: z.array(Engine).max(3),
  script: z.enum(['arabic', 'latin', 'other', 'none']).nullable(),
  /** The page's language, its primary subtag only (`ar` of `ar-SA`). */
  lang: z
    .string()
    .regex(/^[a-z]{2,3}$/)
    .nullable(),
  dir: z.enum(['ltr', 'rtl', 'auto']).nullable(),
  score: z.number().int().min(0).max(100).nullable(),
  /** The platform's id as the platform rule names it (`salla`, `wordpress`); null when none. */
  platform: z.string().regex(KEBAB_ID).max(64).nullable(),
  /** The Chrome UX Report: null when it was not asked; `found: false` when it has no data for the site. */
  crux: z
    .strictObject({
      found: z.boolean(),
      lcp: Milliseconds,
      inp: Milliseconds,
      cls: Milliseconds,
    })
    .nullable(),
  rules: z.record(z.string().regex(KEBAB_ID), z.enum(['p', 'f', 'r', 'n', 'e'])),
  /** The rule set's version: results of two versions are not mixed in one edition. */
  ruleset: z.string().max(32),
  ms: z.number().int().nonnegative(),
})
export type Outcome = z.infer<typeof Outcome>

/** Why a page that was fetched was not judged: a bot challenge, or no page to judge. */
export type Unjudged = 'bot-challenge' | 'no-page'

/** The compact outcome of a scan's report, and the reason when the page was not judged. */
export function compact(report: Report): { outcome: Outcome; unjudged: Unjudged | null } {
  const rules: Record<string, RuleCode> = {}
  for (const rule of report.rules) rules[rule.id] = RULE_CODE[rule.status]
  const engines = (report.scan.render ?? [])
    .filter((run) => run.status === 'rendered')
    .map((run) => run.engine)
  const challenged = rules['bot-challenge'] === 'f'
  const reached =
    report.page !== null &&
    report.scan.status !== 'failed' &&
    report.score.overall !== null &&
    !challenged
  const lang = report.page?.lang?.toLowerCase().split(/[-_]/, 1)[0] ?? null
  const crux = report.facts.crux
  const outcome: Outcome = {
    v: 1,
    reached,
    status: report.scan.status,
    rendered: engines.length > 0,
    engines,
    script: report.page?.dominantScript ?? null,
    lang: lang !== null && /^[a-z]{2,3}$/.test(lang) ? lang : null,
    dir: report.page?.dir ?? null,
    score: report.score.overall,
    platform: report.facts.platform?.primary?.id ?? null,
    crux:
      crux === undefined
        ? null
        : {
            found: crux.outcome === 'found',
            lcp: crux.lcp,
            inp: crux.inp,
            cls: crux.cls,
          },
    rules,
    ruleset: report.generator.rulesetVersion,
    ms: report.scan.durationMs,
  }
  return { outcome, unjudged: reached ? null : challenged ? 'bot-challenge' : 'no-page' }
}

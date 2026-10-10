import type {
  CrawlComparison,
  CrawlReport,
  Localized,
  LogoType,
  ScanComparison,
  SeverityName,
} from '@arablyzer/api-contract'
import { CRAWL_UI, PDF_UI, REPORT, type PdfStrings } from '@arablyzer/i18n'
import type { Report } from '@arablyzer/report-schema'
import { ruleById } from '@arablyzer/rules'
import { brandColorOf } from './contrast'
import { fixBlocks } from './markdown'
import type { Block, PdfBrand, PdfDocument } from './model'

type Lang = 'ar' | 'en'
type Strings = PdfStrings['doc']
const SEVERITIES: readonly SeverityName[] = ['critical', 'serious', 'moderate', 'minor', 'info']

/** What the account keeps of its brand, and what the plan allows: the input of a branded document. */
export interface BrandInput {
  readonly name: string
  readonly color: string | null
  readonly logo: { readonly type: LogoType; readonly bytes: Uint8Array } | null
  /** Whether the plan keeps the "by Arablyzer" line. */
  readonly credit: boolean
}

/** The brand of a document: null (Arablyzer's own) when the account has no name set. */
export function brandOf(input: BrandInput | null, lang: Lang): PdfBrand | null {
  if (input === null || input.name.trim() === '') return null
  return {
    name: clip(input.name.trim(), 60),
    color: brandColorOf(input.color).color,
    logo:
      input.logo === null
        ? null
        : { type: input.logo.type, data: Buffer.from(input.logo.bytes).toString('base64') },
    credit: input.credit ? PDF_UI[lang].doc.creditBy : '',
  }
}

/** Text cut to a length, whole characters, with an ellipsis. */
export function clip(value: string, max: number): string {
  const chars = Array.from(value.replace(/\s+/g, ' ').trim())
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max - 1).join('')}…`
}

/** Text drawn as code: no backtick inside, so the span cannot be ended from within. */
const code = (value: string, max = 140): string => `\`${clip(value, max).replaceAll('`', "'")}\``

const dateOf = (iso: string, lang: Lang): string =>
  new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(iso))

const hostOf = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return clip(url, 80)
  }
}

interface Frame {
  readonly lang: Lang
  readonly brand: PdfBrand | null
  readonly generatedAt: Date
  readonly t: Strings
}

const frameOf = (lang: Lang, brand: PdfBrand | null, generatedAt: Date): Frame => ({
  lang,
  brand,
  generatedAt,
  t: PDF_UI[lang].doc,
})

function documentOf(
  frame: Frame,
  kind: PdfDocument['kind'],
  heading: string,
  sub: string,
  cover: Omit<PdfDocument['cover'], 'kicker' | 'heading' | 'sub'>,
  sections: PdfDocument['sections'],
): PdfDocument {
  const { t, brand, lang } = frame
  const who = brand?.name ?? t.mark
  return {
    v: 1,
    lang,
    kind,
    title: clip(`${t.kicker[kind]} — ${heading}`, 300),
    brand,
    mark: t.mark,
    cover: { kicker: t.kicker[kind], heading: clip(heading, 300), sub: clip(sub, 300), ...cover },
    sections: sections.filter((section) => section.blocks.length > 0),
    footer: {
      line: clip(t.footer(who, dateOf(frame.generatedAt.toISOString(), lang)), 160),
      of: t.of,
    },
  }
}

/** The fix section of a rule, as blocks, in the reader's language. */
function fixOf(ruleId: string, lang: Lang): Extract<Block, { t: 'issue' }>['fix'] {
  const markdown = ruleById(ruleId)?.copy[lang].sections.fix ?? ''
  return fixBlocks(markdown)
    .slice(0, 30)
    .map((block) =>
      block.t === 'p'
        ? { t: 'p', text: clip(block.text, 2_000) }
        : block.t === 'list'
          ? {
              t: 'list',
              ordered: block.ordered,
              items: block.items.slice(0, 60).map((i) => clip(i, 1_500)),
            }
          : { t: 'code', text: block.text.slice(0, 3_000) },
    )
}

const categoryLabel = (id: string, lang: Lang): string =>
  (REPORT[lang].categories as Readonly<Record<string, string>>)[id] ?? id

const LINES_PER_ISSUE = 5
const MAX_ISSUES_PER_SECTION = 120

/** A page report (one scan). */
export function pageDocument(input: {
  readonly report: Report
  readonly lang: Lang
  readonly brand: PdfBrand | null
  readonly generatedAt: Date
}): PdfDocument {
  const { report, lang } = input
  const frame = frameOf(lang, input.brand, input.generatedAt)
  const { t } = frame
  const url = report.target.finalUrl ?? report.target.url
  const rendered = (report.scan.render ?? []).filter((run) => run.status === 'rendered')
  const { summary, score } = report

  const sections: PdfDocument['sections'] = []
  const stats: Block = {
    t: 'stats',
    items: [
      { label: t.stats.passed, value: String(summary.pass), tone: 'good' },
      {
        label: t.stats.failed,
        value: String(summary.fail),
        tone: summary.fail > 0 ? 'bad' : 'neutral',
      },
      { label: t.stats.review, value: String(summary.needsReview) },
      {
        label: t.stats.critical,
        value: String(summary.bySeverity.critical),
        tone: summary.bySeverity.critical > 0 ? 'bad' : 'good',
      },
    ],
  }
  const summaryBlocks: Block[] = [stats]
  if (report.scan.status === 'partial') summaryBlocks.push({ t: 'p', text: t.partial })
  if (report.scan.status === 'failed') summaryBlocks.push({ t: 'p', text: t.failedScan })
  sections.push({ heading: t.sections.summary, blocks: summaryBlocks })

  const categories = Object.entries(score.categories).filter(
    (entry): entry is [string, number] => entry[1] !== null,
  )
  if (categories.length > 0) {
    sections.push({
      heading: t.sections.categories,
      blocks: [
        {
          t: 'table',
          head: [t.category, t.score],
          rows: categories
            .sort((a, b) => a[1] - b[1])
            .map(([id, value]) => [categoryLabel(id, lang), String(value)]),
        },
      ],
    })
  }

  // Failed rules and those that need a review, each with where it was seen and how to fix it.
  const byRule = new Map(report.rules.map((rule) => [rule.id, rule]))
  const problems = report.rules.filter(
    (rule) => rule.status === 'fail' || rule.status === 'needs-review',
  )
  let any = false
  for (const severity of SEVERITIES) {
    const ofSeverity = problems
      .filter((rule) => rule.severity === severity)
      .sort(
        (a, b) =>
          Number(a.status === 'needs-review') - Number(b.status === 'needs-review') ||
          a.id.localeCompare(b.id, 'en'),
      )
    if (ofSeverity.length === 0) continue
    any = true
    const blocks: Block[] = ofSeverity.slice(0, MAX_ISSUES_PER_SECTION).map((rule) => {
      const findings = report.findings.filter((finding) => finding.ruleId === rule.id)
      const lines = findings.slice(0, LINES_PER_ISSUE).map((finding) => {
        const where = finding.evidence.selector ?? finding.evidence.url ?? finding.evidence.snippet
        return `${clip(finding.message[lang], 400)}${where === undefined ? '' : ` ${code(where)}`}`
      })
      if (findings.length > LINES_PER_ISSUE)
        lines.push(t.moreFindings(findings.length - LINES_PER_ISSUE))
      return {
        t: 'issue' as const,
        severity,
        chip: t.severity[severity],
        title: clip(byRule.get(rule.id)?.title[lang] ?? rule.id, 300),
        meta: clip(
          `${categoryLabel(rule.category, lang)}${rule.status === 'needs-review' ? ` · ${t.needsReview}` : ''}`,
          300,
        ),
        lines,
        fixLabel: t.howToFix,
        fix: fixOf(rule.id, lang),
      }
    })
    if (ofSeverity.length > MAX_ISSUES_PER_SECTION) {
      blocks.push({ t: 'p', text: t.moreIssues(ofSeverity.length - MAX_ISSUES_PER_SECTION) })
    }
    sections.push({ heading: t.sections.severity(t.severity[severity], ofSeverity.length), blocks })
  }
  if (!any && report.scan.status !== 'failed') {
    sections.push({
      heading: t.sections.severity(t.severity.info, 0),
      blocks: [{ t: 'p', text: t.noFindings }],
    })
  }

  const xray = report.facts.xray
  if (xray !== undefined) {
    const blocks: Block[] = []
    if (xray.percent !== null) blocks.push({ t: 'p', text: t.xrayLead(xray.percent) })
    for (const engine of xray.engines) {
      const name = ENGINE_NAME[engine.engine]
      blocks.push({ t: 'p', text: t.xrayEngine(name, engine.total, engine.broken) })
      if (engine.words.length > 0) {
        blocks.push({
          t: 'p',
          text: t.xrayWords(
            engine.words
              .slice(0, 12)
              .map((word) => code(word.text, 40))
              .join(' '),
          ),
        })
      }
      if (engine.image !== null) {
        blocks.push({
          t: 'image',
          src: engine.image,
          alt: t.xrayAlt(name),
          caption: t.xrayAlt(name),
        })
      }
    }
    sections.push({ heading: t.sections.xray, blocks })
  }

  const notices = report.scan.notices.slice(0, 20).map((notice) => clip(notice.message[lang], 500))
  if (notices.length > 0)
    sections.push({
      heading: t.sections.notes,
      blocks: [{ t: 'list', ordered: false, items: notices }],
    })

  return documentOf(
    frame,
    'scan',
    hostOf(url),
    url,
    {
      score: score.overall,
      scoreLabel: score.overall === null ? t.noScore : t.overall,
      scoreNote: t.scoreNote(score.rules.ran, score.rules.total),
      facts: [
        { label: t.facts.page, value: clip(url, 300) },
        { label: t.facts.scanned, value: dateOf(report.target.fetchedAt, lang) },
        { label: t.facts.made, value: dateOf(input.generatedAt.toISOString(), lang) },
        {
          label: t.facts.browsers,
          value:
            rendered.length === 0
              ? t.facts.noBrowsers
              : rendered.map((run) => ENGINE_NAME[run.engine]).join(' · '),
        },
      ],
    },
    sections,
  )
}

const ENGINE_NAME = { chromium: 'Chromium', firefox: 'Firefox', webkit: 'WebKit' } as const

/** A crawl report. */
export function crawlDocument(input: {
  readonly report: CrawlReport
  readonly lang: Lang
  readonly brand: PdfBrand | null
  readonly generatedAt: Date
}): PdfDocument {
  const { report, lang } = input
  const frame = frameOf(lang, input.brand, input.generatedAt)
  const { t } = frame
  const kinds = CRAWL_UI[lang].report.kinds
  const scores = report.templates.flatMap((template) =>
    template.representatives.flatMap((rep) => (rep.score === null ? [] : [rep.score])),
  )
  const score =
    scores.length === 0 ? null : Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
  const { crawl } = report

  const sections: PdfDocument['sections'] = [
    {
      heading: t.sections.summary,
      blocks: [
        {
          t: 'stats',
          items: [
            { label: t.stats.found, value: String(crawl.pagesFound) },
            { label: t.stats.checked, value: String(crawl.pagesChecked) },
            { label: t.stats.templates, value: String(crawl.templates) },
            {
              label: t.stats.issues,
              value: String(report.issues.length),
              tone: report.issues.length > 0 ? 'bad' : 'good',
            },
          ],
        },
      ],
    },
  ]
  const titleOf = (id: string): string =>
    report.issues.find((issue) => issue.ruleId === id)?.title[lang] ?? id
  if (report.templates.length > 0) {
    sections.push({
      heading: t.sections.templates,
      blocks: [
        {
          t: 'table',
          head: [t.template, t.pagesFound, t.pagesChecked, t.browserScore, t.topIssues],
          rows: report.templates.slice(0, 100).map((template) => {
            const reps = template.representatives.flatMap((rep) =>
              rep.score === null ? [] : [rep.score],
            )
            return [
              `${kinds[template.kind]} ${code(template.pattern, 80)}`,
              String(template.found),
              String(template.checked),
              reps.length === 0
                ? t.absent
                : String(Math.round(reps.reduce((a, b) => a + b, 0) / reps.length)),
              template.topIssues.length === 0
                ? t.absent
                : template.topIssues.map((id) => clip(titleOf(id), 80)).join('، '),
            ]
          }),
        },
      ],
    })
  }
  for (const severity of SEVERITIES) {
    const ofSeverity = report.issues.filter((issue) => issue.severity === severity)
    if (ofSeverity.length === 0) continue
    sections.push({
      heading: t.sections.severity(t.severity[severity], ofSeverity.length),
      blocks: ofSeverity.slice(0, MAX_ISSUES_PER_SECTION).map((issue) => ({
        t: 'issue' as const,
        severity,
        chip: t.severity[severity],
        title: clip(issue.title[lang], 300),
        meta: clip(`${t.pagesOf(issue.pages)}${issue.rendered ? ` · ${t.renderedTag}` : ''}`, 300),
        lines: issue.templates.slice(0, 8).map((on) => {
          const template = report.templates.find((candidate) => candidate.key === on.template)
          const example = on.examples[0]
          return `${template === undefined ? '' : `${code(template.pattern, 80)}: `}${t.affected(on.pages, on.checked)}${example === undefined ? '' : ` — ${t.example} ${code(example)}`}`
        }),
        fixLabel: t.howToFix,
        fix: fixOf(issue.ruleId, lang),
      })),
    })
  }
  return documentOf(
    frame,
    'crawl',
    hostOf(crawl.origin),
    crawl.origin,
    {
      score,
      scoreLabel: score === null ? t.noScore : t.overall,
      scoreNote: t.crawlScoreNote,
      facts: [
        { label: t.facts.site, value: clip(crawl.origin, 300) },
        { label: t.facts.found, value: String(crawl.pagesFound) },
        { label: t.facts.checked, value: String(crawl.pagesChecked) },
        { label: t.facts.made, value: dateOf(input.generatedAt.toISOString(), lang) },
      ],
    },
    sections,
  )
}

const signed = (n: number | null): string =>
  n === null ? '—' : n > 0 ? `+${String(n)}` : String(n)
const CHANGE_ORDER = ['new', 'worsened', 'fixed', 'improved'] as const
const MAX_CHANGES = 150

/** A comparison of two page scans. */
export function scanComparisonDocument(input: {
  readonly comparison: ScanComparison
  readonly lang: Lang
  readonly brand: PdfBrand | null
  readonly generatedAt: Date
}): PdfDocument {
  const { comparison, lang } = input
  const frame = frameOf(lang, input.brand, input.generatedAt)
  const { t } = frame
  const { overall, counts } = comparison
  const blocks: Block[] = [
    {
      t: 'stats',
      items: [
        { label: t.stats.new, value: String(counts.new), tone: counts.new > 0 ? 'bad' : 'good' },
        {
          label: t.stats.worsened,
          value: String(counts.worsened),
          tone: counts.worsened > 0 ? 'bad' : 'good',
        },
        { label: t.stats.fixed, value: String(counts.fixed), tone: 'good' },
        { label: t.stats.improved, value: String(counts.improved), tone: 'good' },
      ],
    },
    { t: 'p', text: comparison.sameRules ? t.sameRulesNote : t.differentRulesNote },
  ]
  const sections: PdfDocument['sections'] = [{ heading: t.sections.summary, blocks }]
  if (comparison.categories.length > 0) {
    sections.push({
      heading: t.sections.categories,
      blocks: [
        {
          t: 'table',
          head: [t.category, t.before, t.after, t.change],
          rows: comparison.categories.map((c) => [
            categoryLabel(c.category, lang),
            c.before === null ? t.absent : String(c.before),
            c.after === null ? t.absent : String(c.after),
            signed(c.change),
          ]),
        },
      ],
    })
  }
  if (comparison.engines.length > 0) {
    sections.push({
      heading: t.sections.engines,
      blocks: [
        {
          t: 'table',
          head: [t.browser, t.before, t.after],
          rows: comparison.engines.map((e) => [
            ENGINE_NAME[e.engine],
            e.before === null
              ? t.absent
              : `${t.status[e.before]}${e.findingsBefore === null ? '' : ` · ${String(e.findingsBefore)} ${t.findings}`}`,
            e.after === null
              ? t.absent
              : `${t.status[e.after]}${e.findingsAfter === null ? '' : ` · ${String(e.findingsAfter)} ${t.findings}`}`,
          ]),
        },
      ],
    })
  }
  let shown = 0
  for (const kind of CHANGE_ORDER) {
    const changes = comparison.changes.filter((change) => change.kind === kind)
    if (changes.length === 0) continue
    const room = Math.max(0, MAX_CHANGES - shown)
    shown += Math.min(room, changes.length)
    sections.push({
      heading: t.sections.severity(t.sections.changes[kind], changes.length),
      blocks: changes.slice(0, room).map((change) => ({
        t: 'issue' as const,
        severity: change.severity,
        chip: t.severity[change.severity],
        title: clip(change.message[lang], 300),
        meta: clip(
          `${ruleById(change.ruleId)?.copy[lang].title ?? change.ruleId}${change.locator === null ? '' : ` ${code(change.locator)}`}`,
          300,
        ),
        lines: [],
        ...(kind === 'new' || kind === 'worsened'
          ? { fixLabel: t.howToFix, fix: fixOf(change.ruleId, lang) }
          : { fix: [] }),
      })),
    })
  }
  const omitted =
    comparison.omitted +
    Math.max(0, comparison.changes.filter((c) => c.kind !== 'unchanged').length - shown)
  if (omitted > 0)
    sections.push({ heading: t.sections.notes, blocks: [{ t: 'p', text: t.omitted(omitted) }] })
  return documentOf(
    frame,
    'compare-scans',
    hostOf(comparison.head.url),
    comparison.head.url,
    {
      score: overall.after,
      scoreLabel: t.overall,
      scoreNote:
        overall.change === null
          ? t.noScore
          : `${t.change}: ${signed(overall.change)} (${t.share(overall.before === null ? t.absent : String(overall.before), overall.after === null ? t.absent : String(overall.after))})`,
      facts: [
        { label: t.facts.page, value: clip(comparison.head.url, 300) },
        { label: t.facts.from, value: dateOf(comparison.base.createdAt, lang) },
        { label: t.facts.to, value: dateOf(comparison.head.createdAt, lang) },
        { label: t.facts.made, value: dateOf(input.generatedAt.toISOString(), lang) },
      ],
    },
    sections,
  )
}

/** A comparison of two crawls. */
export function crawlComparisonDocument(input: {
  readonly comparison: CrawlComparison
  readonly lang: Lang
  readonly brand: PdfBrand | null
  readonly generatedAt: Date
}): PdfDocument {
  const { comparison, lang } = input
  const frame = frameOf(lang, input.brand, input.generatedAt)
  const { t } = frame
  const kinds = CRAWL_UI[lang].report.kinds
  const { counts } = comparison
  const sections: PdfDocument['sections'] = [
    {
      heading: t.sections.summary,
      blocks: [
        {
          t: 'stats',
          items: [
            {
              label: t.stats.new,
              value: String(counts.new),
              tone: counts.new > 0 ? 'bad' : 'good',
            },
            {
              label: t.stats.worsened,
              value: String(counts.worsened),
              tone: counts.worsened > 0 ? 'bad' : 'good',
            },
            { label: t.stats.fixed, value: String(counts.fixed), tone: 'good' },
            { label: t.stats.improved, value: String(counts.improved), tone: 'good' },
          ],
        },
      ],
    },
  ]
  if (comparison.templates.length > 0) {
    sections.push({
      heading: t.sections.templates,
      blocks: [
        {
          t: 'table',
          head: [t.template, t.pagesFound, t.pagesChecked, t.browserScore],
          rows: comparison.templates
            .slice(0, 100)
            .map((template) => [
              `${kinds[template.kind]} ${code(template.pattern, 80)}`,
              t.share(
                template.before === null ? t.absent : String(template.before.found),
                template.after === null ? t.absent : String(template.after.found),
              ),
              t.share(
                template.before === null ? t.absent : String(template.before.checked),
                template.after === null ? t.absent : String(template.after.checked),
              ),
              `${template.score.before === null ? t.absent : String(template.score.before)} → ${template.score.after === null ? t.absent : String(template.score.after)}`,
            ]),
        },
      ],
    })
  }
  let shown = 0
  for (const kind of CHANGE_ORDER) {
    const changes = comparison.changes.filter((change) => change.kind === kind)
    if (changes.length === 0) continue
    const room = Math.max(0, MAX_CHANGES - shown)
    shown += Math.min(room, changes.length)
    sections.push({
      heading: t.sections.severity(t.sections.changes[kind], changes.length),
      blocks: changes.slice(0, room).map((change) => ({
        t: 'issue' as const,
        severity: change.severity,
        chip: t.severity[change.severity],
        title: clip(change.title[lang], 300),
        meta: clip(
          `${kinds[change.templateKind]} ${code(change.pattern, 80)}${change.rendered ? ` · ${t.renderedTag}` : ''}`,
          300,
        ),
        lines: [
          t.share(
            change.before === null
              ? t.absent
              : t.affected(change.before.pages, change.before.checked),
            change.after === null ? t.absent : t.affected(change.after.pages, change.after.checked),
          ),
        ],
        ...(kind === 'new' || kind === 'worsened'
          ? { fixLabel: t.howToFix, fix: fixOf(change.ruleId, lang) }
          : { fix: [] }),
      })),
    })
  }
  const omitted =
    comparison.omitted +
    Math.max(0, comparison.changes.filter((c) => c.kind !== 'unchanged').length - shown)
  if (omitted > 0)
    sections.push({ heading: t.sections.notes, blocks: [{ t: 'p', text: t.omitted(omitted) }] })
  const { score } = comparison
  return documentOf(
    frame,
    'compare-crawls',
    hostOf(comparison.head.origin),
    comparison.head.origin,
    {
      score: score.after,
      scoreLabel: t.overall,
      scoreNote:
        score.change === null
          ? t.noScore
          : `${t.change}: ${signed(score.change)} (${t.share(score.before === null ? t.absent : String(score.before), score.after === null ? t.absent : String(score.after))})`,
      facts: [
        { label: t.facts.site, value: clip(comparison.head.origin, 300) },
        { label: t.facts.from, value: dateOf(comparison.base.createdAt, lang) },
        { label: t.facts.to, value: dateOf(comparison.head.createdAt, lang) },
        { label: t.facts.made, value: dateOf(input.generatedAt.toISOString(), lang) },
      ],
    },
    sections,
  )
}

export type { Localized }

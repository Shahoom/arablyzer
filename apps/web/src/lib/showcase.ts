import { formatReport } from '@arablyzer/cli/format'
import checkoutFormJson from '@arablyzer/fixtures/golden/reports/07-checkout-form.json'
import productOffersJson from '@arablyzer/fixtures/golden/reports/03-product-offers.json'
import rtlLayoutJson from '@arablyzer/fixtures/golden/reports/04-rtl-layout.json'
import checkoutFormHtml from '@arablyzer/fixtures/golden/sites/07-checkout-form/index.html?raw'
import rtlLayoutHtml from '@arablyzer/fixtures/golden/sites/04-rtl-layout/index.html?raw'
import { Report, type Engine, type Finding, type Localized } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'

/**
 * What the home page shows of the engine: findings from the golden reports, which CI regenerates
 * from the scanner image (M1.3c), picked by rule id. Nothing on the page is typed in by hand, so
 * it cannot drift from what Arablyzer finds (M2.1 plan §1).
 */
export interface Showcase {
  /** The golden site the instrument panel shows. */
  readonly page: string
  readonly heading: { readonly text: string; readonly selector: string }
  readonly score: number
  readonly failed: number
  readonly passed: number
  /** Each engine that rendered the page, and whether it drew the heading's letters joined. */
  readonly engines: readonly {
    readonly engine: Engine
    readonly name: string
    readonly version: string
    readonly joined: boolean
  }[]
  readonly spacing: {
    readonly finding: Finding
    readonly title: Localized
    readonly px: number
    /** The engines that drew the spacing. */
    readonly drawnBy: readonly Engine[]
  }
  readonly overflow: {
    readonly finding: Finding
    readonly title: Localized
    /** The element, as the last step of its selector: "nav". */
    readonly element: string
    readonly overflow: number
    readonly viewport: number
    /** The element's box, in CSS pixels from the viewport's left edge. */
    readonly x: number
    readonly width: number
  }
  readonly name: {
    readonly finding: Finding
    /** The field's label on the test page. */
    readonly label: string
    readonly name: string
    readonly accepted: string
    readonly pattern: string
  }
  readonly price: { readonly finding: Finding; readonly price: string; readonly fixed: string }
}

export const ENGINE_NAMES: Readonly<Record<Engine, string>> = {
  chromium: 'Chromium',
  firefox: 'Firefox',
  webkit: 'WebKit',
}

const rtlLayout = Report.parse(rtlLayoutJson)
const checkoutForm = Report.parse(checkoutFormJson)
const productOffers = Report.parse(productOffersJson)

export const SHOWCASE: Showcase = buildShowcase()

function buildShowcase(): Showcase {
  const spacing = findingOf(rtlLayout, 'ar-letter-spacing')
  const overflow = findingOf(rtlLayout, 'rtl-horizontal-overflow')
  const name = findingOf(checkoutForm, 'form-arabic-name-rejected')
  const price = findingOf(productOffers, 'price-decimals')
  const drawnBy = spacing.evidence.engines ?? []
  const box = overflow.evidence.box
  if (box === undefined) throw new Error('rtl-horizontal-overflow gave no box')
  const selector = spacing.evidence.selector
  if (selector === undefined) throw new Error('ar-letter-spacing gave no selector')
  if (rtlLayout.score.overall === null) throw new Error('Golden report 04 has no score')
  return {
    page: '04-rtl-layout',
    heading: { text: headingOf(rtlLayoutHtml), selector },
    score: rtlLayout.score.overall,
    failed: rtlLayout.summary.fail,
    passed: rtlLayout.summary.pass,
    engines: (rtlLayout.scan.render ?? [])
      .filter((run) => run.status === 'rendered')
      .map((run) => ({
        engine: run.engine,
        name: ENGINE_NAMES[run.engine],
        version: shortVersion(run.engine, run.version),
        joined: !drawnBy.includes(run.engine),
      })),
    spacing: {
      finding: spacing,
      title: titleOf(rtlLayout, spacing.ruleId),
      px: numberOf(spacing, 'letterSpacing'),
      drawnBy,
    },
    overflow: {
      finding: overflow,
      title: titleOf(rtlLayout, overflow.ruleId),
      element: lastStep(overflow.evidence.selector),
      overflow: numberOf(overflow, 'overflow'),
      viewport: numberOf(overflow, 'viewportWidth'),
      x: box.x,
      width: box.width,
    },
    name: {
      finding: name,
      label: labelOf(checkoutFormHtml, name.evidence.selector),
      name: stringOf(name, 'name'),
      accepted: stringOf(name, 'accepted'),
      pattern: stringOf(name, 'pattern'),
    },
    price: { finding: price, price: stringOf(price, 'price'), fixed: stringOf(price, 'fixed') },
  }
}

/**
 * What the CLI prints for the instrument panel's page, as `formatReport()` writes it, without the
 * lines that time the scan (the golden reports keep no durations) and without its notices.
 */
export function terminalLines(lang: Lang): string[] {
  const lines = formatReport(rtlLayout, lang, false).split('\n')
  lines.pop() // after the last newline
  // The HTTP line and one line per engine follow the first; the notices, a blank line, a heading
  // and one line each, come last.
  const timed = 1 + (rtlLayout.scan.render?.length ?? 0)
  const notices = rtlLayout.scan.notices.length
  const end = notices > 0 ? lines.length - (2 + notices) : lines.length
  return [lines[0] ?? '', ...lines.slice(1 + timed, end)]
}

function findingOf(report: Report, ruleId: string): Finding {
  const finding = report.findings.find((candidate) => candidate.ruleId === ruleId)
  if (finding === undefined) throw new Error(`No ${ruleId} finding in ${report.target.url}`)
  return finding
}

function titleOf(report: Report, ruleId: string): Localized {
  const rule = report.rules.find((result) => result.id === ruleId)
  if (rule === undefined) throw new Error(`No ${ruleId} result in ${report.target.url}`)
  return rule.title
}

function lastStep(selector: string | undefined): string {
  const step = selector?.split('>').at(-1)?.trim()
  if (step === undefined || step === '') throw new Error(`Not a selector: ${String(selector)}`)
  return step
}

/** The label of the field an `#id` selector names, as the test page writes it. */
function labelOf(html: string, selector: string | undefined): string {
  const id = selector?.startsWith('#') === true ? selector.slice(1) : undefined
  const text =
    id === undefined ? undefined : new RegExp(`<label for="${id}">([^<]+)</label>`).exec(html)?.[1]
  if (text === undefined) throw new Error(`Golden site 07 has no label for ${String(selector)}`)
  return text.trim()
}

function numberOf(finding: Finding, key: string): number {
  const value = finding.evidence.values?.[key]
  if (typeof value !== 'number') throw new Error(`${finding.ruleId} has no number ${key}`)
  return value
}

function stringOf(finding: Finding, key: string): string {
  const value = finding.evidence.values?.[key]
  if (typeof value !== 'string') throw new Error(`${finding.ruleId} has no text ${key}`)
  return value
}

/** The test page's heading, as its HTML has it. */
function headingOf(html: string): string {
  const text = /<h1[^>]*>([^<]+)<\/h1>/.exec(html)?.[1]?.trim()
  if (text === undefined || text === '') throw new Error('Golden site 04 has no <h1>')
  return text
}

/**
 * Chromium and Firefox by their major version, as people name them; WebKit by the whole of its
 * short version, whose major number alone says little.
 */
function shortVersion(engine: Engine, version: string | null): string {
  if (version === null) return ''
  return engine === 'webkit' ? version : (version.split('.')[0] ?? version)
}

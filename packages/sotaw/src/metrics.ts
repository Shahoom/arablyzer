import type { Outcome } from './outcome'

/**
 * What the report measures (docs/design/plans/m9-state-of-arabic-web.md §4). Each metric sorts a
 * homepage into one of its categories, or into none when the page cannot be judged for it (a rule
 * that did not apply or did not run), and only the pages that can be judged are its denominator.
 * A binary metric's first category is the property named (`yes`), the second its absence.
 */
export type MetricKind = 'problem' | 'adoption' | 'distribution'
export type MetricGroup =
  'arabic' | 'direction' | 'machines' | 'mobile' | 'speed' | 'security' | 'structure'

export interface MetricDef {
  readonly id: string
  readonly kind: MetricKind
  readonly group: MetricGroup
  /** The rules the metric reads, where it reads rules (the dataset's schema lists them). */
  readonly rules: readonly string[]
  /** The categories' keys, in order; a binary metric's are `yes` and `no`. */
  readonly categories: readonly string[]
  /** The index of the category the outcome falls in, or null. */
  readonly classify: (outcome: Outcome) => number | null
}

type Mode = 'any-fail' | 'applies'
const YES = 0
const NO = 1
const BINARY = ['yes', 'no'] as const

/**
 * `any-fail`: yes when a rule failed, no when none failed and one passed. `applies`: yes when a rule
 * applied (it passed or failed), no when none applied.
 */
function byRules(rules: readonly string[], mode: Mode): (outcome: Outcome) => number | null {
  return (outcome) => {
    const codes = rules.map((id) => outcome.rules[id])
    if (mode === 'any-fail') {
      if (codes.includes('f')) return YES
      return codes.includes('p') ? NO : null
    }
    if (codes.some((code) => code === 'p' || code === 'f')) return YES
    return codes.length > 0 && codes.every((code) => code === 'n') ? NO : null
  }
}

function binary(
  id: string,
  kind: 'problem' | 'adoption',
  group: MetricGroup,
  rules: readonly string[],
  mode: Mode = 'any-fail',
): MetricDef {
  return { id, kind, group, rules, categories: BINARY, classify: byRules(rules, mode) }
}

/** The thresholds of the Core Web Vitals: good up to the first, poor above the second (web.dev). */
const THRESHOLDS = {
  lcp: [2500, 4000],
  inp: [200, 500],
  cls: [0.1, 0.25],
} as const
const BANDS = ['good', 'needs-improvement', 'poor'] as const

function vital(id: 'lcp' | 'inp' | 'cls'): MetricDef {
  const [good, poor] = THRESHOLDS[id]
  return {
    id,
    kind: 'distribution',
    group: 'speed',
    rules: [],
    categories: BANDS,
    classify: ({ crux }) => {
      const value = crux?.[id]
      if (value === null || value === undefined) return null
      return value <= good ? 0 : value <= poor ? 1 : 2
    },
  }
}

/** The security headers the report counts (each is a rule that fails when the header is absent). */
export const HEADER_RULES = [
  'hsts-missing',
  'csp-missing',
  'x-content-type-options-missing',
  'frame-protection-missing',
  'referrer-policy-missing',
] as const

export const METRICS: readonly MetricDef[] = [
  { ...binary('arabic-page', 'adoption', 'arabic', []), classify: arabicPage },
  binary('shaping', 'problem', 'arabic', ['ar-letter-spacing']),
  binary('arabic-font', 'problem', 'arabic', [
    'ar-font-no-arabic',
    'ar-font-missing-letters',
    'ar-font-fallback',
  ]),
  binary('mixed-digits', 'problem', 'arabic', ['ar-digits-mixed']),
  binary('sar-sign-used', 'adoption', 'arabic', ['sar-sign-font'], 'applies'),
  binary('sar-sign-glyph', 'problem', 'arabic', ['sar-sign-font']),
  binary('rtl-lang', 'problem', 'direction', ['rtl-html-dir', 'ar-html-lang']),
  binary('ai-readability', 'problem', 'machines', ['ar-ai-readability', 'js-only-content']),
  binary('ai-blocked', 'problem', 'machines', ['robots-blocks-ai-search']),
  binary('mobile-overflow', 'problem', 'mobile', ['rtl-horizontal-overflow']),
  binary('no-viewport', 'problem', 'mobile', ['viewport-missing']),
  {
    id: 'crux-data',
    kind: 'adoption',
    group: 'speed',
    rules: [],
    categories: BINARY,
    classify: ({ crux }) => (crux === null ? null : crux.found ? YES : NO),
  },
  vital('lcp'),
  vital('inp'),
  vital('cls'),
  binary('no-https', 'problem', 'security', ['https-missing']),
  binary('no-hsts', 'problem', 'security', ['hsts-missing']),
  binary('no-csp', 'problem', 'security', ['csp-missing']),
  binary('no-nosniff', 'problem', 'security', ['x-content-type-options-missing']),
  binary('no-frame-protection', 'problem', 'security', ['frame-protection-missing']),
  binary('no-referrer-policy', 'problem', 'security', ['referrer-policy-missing']),
  {
    id: 'headers',
    kind: 'distribution',
    group: 'security',
    rules: HEADER_RULES,
    // How many of the five headers the page sends: 0 to 5.
    categories: ['0', '1', '2', '3', '4', '5'],
    classify: (outcome) => {
      let present = 0
      for (const id of HEADER_RULES) {
        const code = outcome.rules[id]
        if (code !== 'p' && code !== 'f') return null
        if (code === 'p') present++
      }
      return present
    },
  },
  binary('json-ld', 'adoption', 'structure', ['jsonld-syntax-error'], 'applies'),
  binary('json-ld-broken', 'problem', 'structure', ['jsonld-syntax-error']),
  {
    id: 'score',
    kind: 'distribution',
    group: 'structure',
    rules: [],
    // Arablyzer's score in tens: 0-9, 10-19, ... 90-100.
    categories: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    classify: ({ score }) => (score === null ? null : Math.min(9, Math.floor(score / 10))),
  },
]

function arabicPage({ script }: Outcome): number | null {
  if (script === null) return null
  return script === 'arabic' ? YES : NO
}

const BY_ID: ReadonlyMap<string, MetricDef> = new Map(METRICS.map((m) => [m.id, m]))
export const metricById = (id: string): MetricDef | undefined => BY_ID.get(id)

/** The metrics of the headline row: the six a reader asks first. */
export const HEADLINE_METRICS = [
  'shaping',
  'rtl-lang',
  'arabic-font',
  'mixed-digits',
  'ai-readability',
  'mobile-overflow',
] as const

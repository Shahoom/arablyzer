import { z } from 'zod'

/**
 * Version of the report contract; a major bump means a breaking change (docs/design/phase-0.md
 * §3). 0.2.0 adds rendering (M1.1) and stays open until Phase 1 ends: nothing is published yet.
 */
export const SCHEMA_VERSION = '0.2.0'

/** Rule ids and notice codes: ASCII kebab-case, stable forever (BUILD-PLAN §10). */
export const KEBAB_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/** Evidence snippets are capped so reports stay small. */
export const MAX_SNIPPET_LENGTH = 300

const count = () => z.number().int().nonnegative()

export const Severity = z
  .enum(['critical', 'serious', 'moderate', 'minor', 'info'])
  .meta({ id: 'Severity' })
export type Severity = z.infer<typeof Severity>

/** Most severe first; used for sorting findings and for `--fail-on`. */
export const SEVERITY_ORDER: readonly Severity[] = Severity.options

export const Category = z
  .enum([
    'crawl',
    'index',
    'onpage',
    'links',
    'schema',
    'intl',
    'speed',
    'commerce',
    'ai',
    'trust',
    'ar-render',
    'rtl',
    'ar-content',
    'forms',
    'locale',
  ])
  .meta({ id: 'Category' })
export type Category = z.infer<typeof Category>

export const RuleStatus = z
  .enum(['pass', 'fail', 'needs-review', 'not-applicable', 'error'])
  .meta({ id: 'RuleStatus' })
export type RuleStatus = z.infer<typeof RuleStatus>

export const ScanStatus = z.enum(['complete', 'partial', 'failed'])
export type ScanStatus = z.infer<typeof ScanStatus>

/** Every user-facing string ships in both languages; Arabic is the original (BUILD-PLAN §4). */
export const Localized = z
  .strictObject({ ar: z.string().min(1), en: z.string().min(1) })
  .meta({ id: 'Localized' })
export type Localized = z.infer<typeof Localized>

export const Notice = z.strictObject({ code: z.string().regex(KEBAB_ID), message: Localized })
export type Notice = z.infer<typeof Notice>

export const Redirect = z.strictObject({
  url: z.string().min(1),
  status: z.number().int().min(300).max(399),
})
export type Redirect = z.infer<typeof Redirect>

export const Target = z.strictObject({
  /** The URL exactly as given. */
  url: z.string().min(1),
  /** After redirects; null when nothing could be fetched. */
  finalUrl: z.string().min(1).nullable(),
  fetchedAt: z.iso.datetime(),
  userAgent: z.string().min(1),
  http: z.strictObject({
    status: z.number().int().min(100).max(599).nullable(),
    contentType: z.string().nullable(),
    redirects: z.array(Redirect),
  }),
})
export type Target = z.infer<typeof Target>

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

/** Any JSON value; evidence values are free-form but must stay serialisable. */
export const JsonValue: z.ZodType<JsonValue> = z
  .lazy(() =>
    z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
      z.array(JsonValue),
      z.record(z.string(), JsonValue),
    ]),
  )
  .meta({ id: 'JsonValue' })

/** The browser engines of BUILD-PLAN §5.3. */
export const Engine = z.enum(['chromium', 'firefox', 'webkit']).meta({ id: 'Engine' })
export type Engine = z.infer<typeof Engine>

/** Where an element was drawn, in CSS pixels from the top left of the page. */
export const Box = z
  .strictObject({
    x: z.number().int(),
    y: z.number().int(),
    width: count(),
    height: count(),
  })
  .meta({ id: 'Box' })
export type Box = z.infer<typeof Box>

export const FindingEvidence = z.strictObject({
  url: z.string().min(1).optional(),
  selector: z.string().min(1).optional(),
  snippet: z.string().max(MAX_SNIPPET_LENGTH).optional(),
  location: z
    .strictObject({
      line: z.number().int().positive(),
      column: z.number().int().positive().optional(),
    })
    .optional(),
  /** For findings from the rendered page: the engines it was seen in. */
  engines: z.array(Engine).min(1).optional(),
  /** Where the element was drawn, in the first of those engines. */
  box: Box.optional(),
  values: z.record(z.string(), JsonValue).optional(),
})
export type FindingEvidence = z.infer<typeof FindingEvidence>

export const Finding = z.strictObject({
  ruleId: z.string().regex(KEBAB_ID),
  severity: Severity,
  /** Stable hash of rule + location; used to de-duplicate and to diff scans. */
  fingerprint: z.string().regex(/^[0-9a-f]{16}$/),
  message: Localized,
  evidence: FindingEvidence,
})
export type Finding = z.infer<typeof Finding>

export const RuleResult = z.strictObject({
  id: z.string().regex(KEBAB_ID),
  version: z.string().regex(SEMVER),
  category: Category,
  severity: Severity,
  wcag: z.array(z.string().regex(/^\d+\.\d+\.\d+$/)).optional(),
  status: RuleStatus,
  title: Localized,
  /** Findings dropped beyond the per-rule cap. */
  findingsOmitted: count().optional(),
  /** Machine-readable reason when status is "error". */
  error: z.string().regex(KEBAB_ID).optional(),
})
export type RuleResult = z.infer<typeof RuleResult>

export const Summary = z.strictObject({
  pass: count(),
  fail: count(),
  needsReview: count(),
  notApplicable: count(),
  error: count(),
  bySeverity: z.strictObject({
    critical: count(),
    serious: count(),
    moderate: count(),
    minor: count(),
    info: count(),
  }),
})
export type Summary = z.infer<typeof Summary>

/** 0 to 100, whole; null when no rule with weight applied. */
const ScoreValue = z.number().int().min(0).max(100).nullable()

/**
 * The score (docs/methodology.md): 100 × (1 − failed weight ÷ applicable weight), overall and for
 * each category the scan ran rules of (null when none of them had weight and applied). Weights by
 * severity: critical 10, serious 5, moderate 3, minor 1, info 0. Comparable only within a major
 * version of the rule set (generator.rulesetVersion), between scans that ran the same rules.
 */
export const Score = z
  .strictObject({
    overall: ScoreValue,
    categories: z.partialRecord(Category, ScoreValue),
    /** Some rule could not run, so the score counts only those that did. */
    partial: z.boolean(),
    /**
     * The rules the scan ran, of all in the rule set: fewer without rendering (the rules that
     * read the rendered page are left out) or when the scan named its rules.
     */
    rules: z.strictObject({
      ran: z.number().int().min(0),
      total: z.number().int().min(0),
    }),
  })
  .meta({ id: 'Score' })
export type Score = z.infer<typeof Score>

export const AiCrawlerFact = z.strictObject({
  token: z.string().min(1),
  purpose: z.enum(['search', 'training', 'user-fetch']),
  allowed: z.boolean(),
})
export type AiCrawlerFact = z.infer<typeof AiCrawlerFact>

/** Small collector summaries that tool pages display (design §3). */
export const Facts = z.strictObject({
  robots: z
    .strictObject({
      url: z.string().min(1),
      /** null when robots.txt could not be fetched at all. */
      status: z.number().int().min(100).max(599).nullable(),
      aiCrawlers: z.array(AiCrawlerFact),
    })
    .optional(),
})
export type Facts = z.infer<typeof Facts>

/** One engine's render of the page (M1.1): present only when rendering was asked for. */
export const RenderRun = z
  .strictObject({
    engine: Engine,
    /** The engine's version; null when it did not start. */
    version: z.string().min(1).nullable(),
    /**
     * unavailable: the engine is not installed. refused: the engine sends traffic around the
     * egress proxy, so it renders only where the network is isolated.
     */
    status: z.enum(['rendered', 'failed', 'timeout', 'unavailable', 'refused']),
    durationMs: count(),
    /**
     * Requests the page made, as the browser counted them (inside HTTPS connections too), and
     * those not let through: refused by the egress proxy, or past the page's request limit.
     */
    requests: z.strictObject({ total: count(), refused: count() }),
  })
  .meta({ id: 'RenderRun' })
export type RenderRun = z.infer<typeof RenderRun>

export const Page = z.strictObject({
  lang: z.string().nullable(),
  dir: z.enum(['ltr', 'rtl', 'auto']).nullable(),
  dominantScript: z.enum(['arabic', 'latin', 'other', 'none']),
})
export type Page = z.infer<typeof Page>

export const Report = z
  .strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION),
    generator: z.strictObject({
      name: z.literal('arablyzer'),
      version: z.string().regex(SEMVER),
      rulesetVersion: z.string().regex(SEMVER),
    }),
    target: Target,
    scan: z.strictObject({
      status: ScanStatus,
      durationMs: count(),
      notices: z.array(Notice),
      render: z.array(RenderRun).optional(),
    }),
    /** null when the page could not be fetched or parsed. */
    page: Page.nullable(),
    summary: Summary,
    score: Score,
    rules: z.array(RuleResult),
    findings: z.array(Finding),
    facts: Facts,
  })
  .meta({
    title: 'Arablyzer report',
    description: 'Output of one Arablyzer scan (arablyzer <url> --json).',
  })
export type Report = z.infer<typeof Report>

/** JSON Schema (draft 2020-12) generated from the Zod contract; committed as report.schema.json. */
export function reportJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(Report, { target: 'draft-2020-12' })
}

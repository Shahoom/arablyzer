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

/**
 * complete: the scan reached the page and every rule it ran finished. partial: it fell short, and
 * its report says where: a rule could not run, an engine asked for did not render, or the site
 * answered with an error status or a bot challenge instead of the page (M2.3c), when the score is
 * null too; the CLI exits 2. failed: the page could not be fetched or read at all, or the site
 * asks not to be checked (M2.4): every rule is an error, and there is nothing to judge.
 */
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

/** 0 to 100, whole; null when no rule with weight applied, or the scan did not reach the page. */
const ScoreValue = z.number().int().min(0).max(100).nullable()

/**
 * The score (docs/methodology.md): 100 × (1 − failed weight ÷ applicable weight), overall and for
 * each category the scan ran rules of (null when none of them had weight and applied, and for
 * all of them when the scan did not reach the page). Weights by severity: critical 10, serious 5,
 * moderate 3, minor 1, info 0. Comparable only within a major version of the rule set
 * (generator.rulesetVersion), between scans that ran the same rules.
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
/** YYYY-MM-DD. */
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/**
 * Real-user data from the Chrome UX Report (M1.3b): the 75th percentile of each Core Web Vital
 * on phones, for the page's URL or, when CrUX has none for it, its origin.
 */
export const CruxFact = z
  .strictObject({
    outcome: z.enum(['found', 'not-found']),
    scope: z.enum(['url', 'origin']).nullable(),
    /** The URL or origin as CrUX names it. */
    key: z.string().min(1).max(2048).nullable(),
    /** The days the data covers. */
    period: z.strictObject({ first: IsoDate, last: IsoDate }).nullable(),
    /** Milliseconds. */
    lcp: z.number().nonnegative().nullable(),
    inp: z.number().nonnegative().nullable(),
    /** Without a unit. */
    cls: z.number().nonnegative().nullable(),
  })
  .meta({ id: 'CruxFact' })
export type CruxFact = z.infer<typeof CruxFact>

/** Milliseconds, when measured. */
const Milliseconds = z.number().int().nonnegative().nullable()

/**
 * Lighthouse's lab metrics on its emulated phone, with simulated throttling (M1.3b). They vary
 * from run to run, so they are information, never judged and never part of the score.
 */
export const LabFact = z
  .strictObject({
    /**
     * timeout: out of time, or the page had not loaded when Lighthouse stopped waiting.
     * unavailable: Lighthouse or Chromium is not installed. skipped: the scan left no time.
     */
    status: z.enum(['measured', 'failed', 'timeout', 'unavailable', 'skipped']),
    /** Lighthouse's version: its metrics change from one version to the next. */
    lighthouse: z.string().min(1),
    /** The Chromium it ran in; null when it did not start. */
    chromium: z.string().min(1).nullable(),
    durationMs: count(),
    requests: z.strictObject({ total: count(), refused: count() }),
    /** Lighthouse's own performance score, 0 to 100. */
    performance: ScoreValue,
    metrics: z
      .strictObject({
        fcp: Milliseconds,
        lcp: Milliseconds,
        tbt: Milliseconds,
        si: Milliseconds,
        cls: z.number().nonnegative().nullable(),
      })
      .nullable(),
  })
  .meta({ id: 'LabFact' })
export type LabFact = z.infer<typeof LabFact>

/**
 * The platform a page runs on, from the page and its server alone (rule platform-detected): its
 * CMS or store, builder, plugins and services. Fix guides read `primary` to give steps for the
 * platform ("on Salla: …").
 */
const DetectedTechnology = z.strictObject({
  /** Lowercase, kebab-case: the key of platform-specific fix guides. */
  id: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(64),
  name: z.string().min(1).max(100),
  kind: z.enum(['platform', 'builder', 'plugin', 'service']),
  version: z.string().min(1).max(32).nullable(),
  /** 1 to 100: 75 and over is sure. */
  confidence: z.number().int().min(1).max(100),
})
export const PlatformFact = z
  .strictObject({
    /** The surest CMS or store; null when none was recognized. */
    primary: DetectedTechnology.nullable(),
    technologies: z.array(DetectedTechnology).max(40),
  })
  .meta({ id: 'PlatformFact' })
export type PlatformFact = z.infer<typeof PlatformFact>

/**
 * What Google's Knowledge Graph knows of the page's brand name (rule knowledge-graph-entity),
 * asked in Arabic and English: information, never judged. `unknown`: no entity has the name.
 */
export const KnowledgeGraphFact = z
  .strictObject({
    outcome: z.enum(['known', 'unknown', 'no-name']),
    /** The name asked about; null when the page gives none. */
    brand: z.string().min(1).max(100).nullable(),
    entities: z
      .array(
        z.strictObject({
          lang: z.enum(['ar', 'en']),
          name: z.string().min(1).max(200),
          types: z.array(z.string().max(100)).max(6),
          description: z.string().max(200).nullable(),
          wikipediaUrl: z.string().max(2048).nullable(),
        }),
      )
      .max(2),
  })
  .meta({ id: 'KnowledgeGraphFact' })
export type KnowledgeGraphFact = z.infer<typeof KnowledgeGraphFact>

/**
 * The domain's authority from Open PageRank (a whole scan, with a key), built on Common Crawl's
 * web graph: information, never judged and never part of the score. 0 is the weakest, 10 the
 * strongest.
 */
export const OpenPageRankFact = z
  .strictObject({
    /** The domain asked about: the page's registrable domain. */
    domain: z.string().min(1).max(255),
    /** 0 to 10, with up to two decimals; null when the domain is not in the index yet. */
    score: z.number().min(0).max(10).nullable(),
    /** The domain's place among all domains (1 is first); null when the API gave none. */
    position: z.number().int().positive().nullable(),
    /** The domains that link to it. */
    referringDomains: z.number().int().nonnegative().nullable(),
    /** The score over the last year; null with too little history. */
    trend: z.enum(['rising', 'stable', 'falling']).nullable(),
    /** The month of the score, YYYY-MM-DD. */
    asOf: IsoDate.nullable(),
  })
  .meta({ id: 'OpenPageRankFact' })
export type OpenPageRankFact = z.infer<typeof OpenPageRankFact>

/**
 * The Arabic web fonts the page loaded and what a subset of each, made for the Arabic text the
 * page shows, would weigh (rule ar-font-subset-savings and the font slimmer tool): the tool's page
 * offers each as a download, made on request from the font's own address.
 */
export const ArabicFontsFact = z
  .strictObject({
    fonts: z
      .array(
        z.strictObject({
          family: z.string().min(1).max(200),
          url: z.string().min(1).max(2048),
          format: z.enum(['woff2', 'woff', 'ttf', 'otf', 'unknown']),
          bytes: count(),
          weight: z.string().max(30).nullable(),
          style: z.string().max(30).nullable(),
          /** The characters of the page's text set in this family (the first 400). */
          characters: z.string().max(1600),
          /** Null when no subset was made: no text of the page uses the family, or the file is unreadable. */
          subsetBytes: count().nullable(),
          unicodeRange: z.string().max(4000).nullable(),
        }),
      )
      .max(8),
  })
  .meta({ id: 'ArabicFontsFact' })
export type ArabicFontsFact = z.infer<typeof ArabicFontsFact>

/**
 * What the site's own search did with words of the page in their spelling variants (rule
 * search-spelling-variants and the spelling search tool): each word the page uses, how many
 * results its own spelling found, and each variant against it. `lost` counts the variants whose
 * search found none, or fewer than half, of what the word's own spelling found, of `total` asked
 * where the word's own spelling found something; an Arabizi form is shown and never counted.
 */
export const SearchTestFact = z
  .strictObject({
    via: z.enum(['form', 'wordpress', 'platform']),
    /** The search's address, without the query. */
    url: z.string().min(1).max(2048),
    requests: count(),
    lost: count(),
    total: count(),
    words: z
      .array(
        z.strictObject({
          word: z.string().min(1).max(40),
          /** Links its own spelling found beyond the site's chrome; null with no answer. */
          results: count().nullable(),
          first: z.string().max(500).nullable(),
          variants: z
            .array(
              z.strictObject({
                kind: z.enum([
                  'ta-marbuta',
                  'alef',
                  'ya',
                  'tatweel',
                  'diacritics',
                  'digits',
                  'arabizi',
                ]),
                query: z.string().min(1).max(60),
                results: count().nullable(),
                first: z.string().max(500).nullable(),
                outcome: z.enum(['same', 'differs', 'lost', 'unanswered']),
                counted: z.boolean(),
              }),
            )
            .max(12),
        }),
      )
      .max(12),
  })
  .meta({ id: 'SearchTestFact' })
export type SearchTestFact = z.infer<typeof SearchTestFact>

export const Facts = z.strictObject({
  robots: z
    .strictObject({
      url: z.string().min(1),
      /** null when robots.txt could not be fetched at all. */
      status: z.number().int().min(100).max(599).nullable(),
      aiCrawlers: z.array(AiCrawlerFact),
    })
    .optional(),
  /** Present when CrUX was asked, with a key, and answered. */
  crux: CruxFact.optional(),
  /** Present when Lighthouse was asked for (--lab): information, never part of the score. */
  lab: LabFact.optional(),
  /** Present when the platform rule ran on an HTML page. */
  platform: PlatformFact.optional(),
  /** Present when Knowledge Graph was asked, with a key, and answered. */
  knowledgeGraph: KnowledgeGraphFact.optional(),
  /** Present when Open PageRank was asked, with a key, and listed the domain. */
  openPageRank: OpenPageRankFact.optional(),
  /** Present when the font slimmer rule ran with a render that loaded an Arabic web font. */
  arabicFonts: ArabicFontsFact.optional(),
  /** Present when the spelling search test asked the site's search and read its answers. */
  searchTest: SearchTestFact.optional(),
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
     * those not let through: refused by the egress proxy, past the page's request limit or its
     * host limit, or for sending data (every request but GET and HEAD, and every WebSocket).
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

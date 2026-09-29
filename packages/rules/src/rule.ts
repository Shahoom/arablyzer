import type {
  Box,
  CruxFacts,
  Engine,
  PageFacts,
  RenderedFacts,
  RobotsFacts,
  SitemapFacts,
  SourceLocation,
} from '@arablyzer/collectors'
import type { Category, JsonValue, Redirect, Severity } from '@arablyzer/report-schema'
import { loadRuleCopy, type RuleCopy } from './copy'

/**
 * What a rule needs collected. `http`: a 2xx page response (headers; HTML optional). `headers`:
 * the same, for a rule that reads the response's headers, which an HTTP example on a tool's page
 * can show (M2.3). `redirects`: with a 2xx page, the redirects its fetch followed to reach it,
 * which the report gives as target.http.redirects (M2.3a). `html` and `text`: a 2xx HTML page.
 * `robots`: robots.txt for the final URL. `render`: the page rendered in a browser (only with
 * --render; M1.1). `files`, with `render`: the files the page loaded, read after the render
 * (stylesheets, fonts, text responses, image files); the rule sees only the engines that read
 * them. `crux`: real-user data from the Chrome UX Report, which needs an API key; without one the
 * rule does not apply (M1.3b). `sitemap`: the site's sitemaps, those robots.txt names or
 * /sitemap.xml (M2.3c); like robots.txt, they are the site's, read whatever the page answered.
 * `response`: the page's answer whatever its status, its status and headers, for a rule that
 * judges how the server answered, such as with a bot challenge (M2.3c).
 */
export type CollectorId =
  | 'http'
  | 'headers'
  | 'redirects'
  | 'html'
  | 'text'
  | 'robots'
  | 'render'
  | 'files'
  | 'crux'
  | 'sitemap'
  | 'response'

export interface Evidence {
  readonly page: PageFacts
  /**
   * Present when the rule needs `redirects`: each redirect the page's fetch followed, in order,
   * the URL that answered it and its status; the last one's Location is page.url. Empty when the
   * page answered at once.
   */
  readonly redirects?: readonly Redirect[]
  /** Present when the rule needs `robots`; never `failed` (the engine reports an error instead). */
  readonly robots?: RobotsFacts
  /**
   * Present when the rule needs `render`: one entry per engine that rendered the page, never
   * empty (the engine reports an error when none did).
   */
  readonly rendered?: readonly RenderedFacts[]
  /** Present when the rule needs `crux` and CrUX answered; never `failed` (an error instead). */
  readonly crux?: CruxFacts
  /**
   * Present when the rule needs `sitemap` and each sitemap the scan asked for answered; when one
   * could not be read, the engine reports an error instead.
   */
  readonly sitemap?: SitemapFacts
}

/** Detectors return data only; the wording comes from the copy files (docs/design/phase-0.md §1). */
export interface DetectorFinding<M extends string = string> {
  /** A message id from the rule's copy files. */
  readonly message: M
  /** Fill the message's `{placeholders}` and stay in the report as evidence. */
  readonly values?: Readonly<Record<string, JsonValue>>
  /** Defaults to the page URL (robots findings point at robots.txt). */
  readonly url?: string
  readonly selector?: string
  readonly snippet?: string
  /** Leave out the column when it cannot be exact (e.g. inside text with entities). */
  readonly location?: SourceLocation | { readonly line: number }
  /** For findings on the rendered page: the engines it was seen in, and where in the first. */
  readonly engines?: readonly Engine[]
  readonly box?: Box
  /** What tells this finding apart from others of the rule on the page; part of the fingerprint. */
  readonly key?: string
}

/** BUILD-PLAN §10, plus `messages` so the copy files and the detector cannot drift apart. */
export interface Rule<M extends string = string> {
  /** Stable forever once published. */
  readonly id: string
  readonly version: string
  readonly category: Category
  readonly severity: Severity
  readonly wcag?: readonly string[]
  /** "Needs human review": reported, never deducted. */
  readonly manualCheck?: boolean
  readonly needs: readonly CollectorId[]
  /**
   * With `render`: the engines whose facts the rule can read (Chromium alone reports the fonts
   * that drew a text); all engines by default. The rule sees only those engines' facts.
   */
  readonly renderEngines?: readonly Engine[]
  readonly messages: readonly M[]
  /**
   * False → not-applicable: the page has nothing this rule checks. Rules that need `render`
   * decide from the rendered page, whose text may come from scripts the HTML does not show; the
   * engine always passes the evidence, and tests of rules that read only the page may leave it out.
   */
  readonly appliesTo: (page: PageFacts, evidence?: Evidence) => boolean
  /**
   * A pure function: tested without a browser or network. A rule whose findings grow with the
   * page (one per punctuation mark, say) yields them lazily, so the engine keeps the ones it
   * reports and only counts the rest (M0.2 review: a hostile page cannot exhaust memory).
   */
  readonly detect: (evidence: Evidence) => Iterable<DetectorFinding<M>>
  readonly copy: { readonly ar: RuleCopy; readonly en: RuleCopy }
}

export type RuleDefinition<M extends string> = Omit<Rule<M>, 'copy'>

/** Attaches the rule's copy from rules/<id>/copy.{ar,en}.md. */
export function defineRule<const M extends string>(definition: RuleDefinition<M>): Rule<M> {
  return { ...definition, copy: loadRuleCopy(definition.id) }
}

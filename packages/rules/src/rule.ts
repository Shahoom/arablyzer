import type { PageFacts, RobotsFacts, SourceLocation } from '@arablyzer/collectors'
import type { Category, JsonValue, Severity } from '@arablyzer/report-schema'
import { loadRuleCopy, type RuleCopy } from './copy'

/**
 * What a rule needs collected. `http`: a 2xx page response (headers; HTML optional).
 * `html` and `text`: a 2xx HTML page. `robots`: robots.txt for the final URL.
 */
export type CollectorId = 'http' | 'html' | 'text' | 'robots'

export interface Evidence {
  readonly page: PageFacts
  /** Present when the rule needs `robots`; never `failed` (the engine reports an error instead). */
  readonly robots?: RobotsFacts
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
  readonly location?: SourceLocation
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
  readonly messages: readonly M[]
  /** False → not-applicable: the page has nothing this rule checks. */
  readonly appliesTo: (page: PageFacts) => boolean
  /** A pure function: tested without a browser or network. */
  readonly detect: (evidence: Evidence) => DetectorFinding<M>[]
  readonly copy: { readonly ar: RuleCopy; readonly en: RuleCopy }
}

export type RuleDefinition<M extends string> = Omit<Rule<M>, 'copy'>

/** Attaches the rule's copy from rules/<id>/copy.{ar,en}.md. */
export function defineRule<const M extends string>(definition: RuleDefinition<M>): Rule<M> {
  return { ...definition, copy: loadRuleCopy(definition.id) }
}

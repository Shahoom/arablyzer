import type { FieldElement } from '@arablyzer/collectors'
import { MAX_PATTERN_LENGTH, PATTERN_TYPES } from './html-pattern'

/** A field whose value its pattern attribute checks. */
export type PatternField = FieldElement & { readonly pattern: string }

/**
 * An input with a pattern, of a type the pattern applies to. Patterns longer than any real one are
 * left out before anything reads them: a page could make them slow for our own regular expressions.
 */
export function hasPattern(field: FieldElement): field is PatternField {
  return (
    field.tag === 'input' &&
    field.pattern !== null &&
    field.pattern.length <= MAX_PATTERN_LENGTH &&
    PATTERN_TYPES.has(field.type)
  )
}

/** Lowercase words of a field's name and id: "billing_firstName" gives billing, first, name. */
export function identifierWords(field: {
  readonly name: string | null
  readonly id: string | null
}): string[] {
  return [field.name, field.id].flatMap((identifier) =>
    (identifier ?? '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word !== ''),
  )
}

/** What a person reads for the field: its labels, aria-label and placeholder. */
export function fieldTexts(field: {
  readonly label: string | null
  readonly ariaLabel: string | null
  readonly placeholder: string | null
}): string[] {
  return [field.label, field.ariaLabel, field.placeholder].flatMap((text) =>
    text === null || text.trim() === '' ? [] : [text],
  )
}

/** Patterns can be long; messages show the start. */
export function shownPattern(pattern: string): string {
  return pattern.length > 100 ? `${pattern.slice(0, 100)}…` : pattern
}

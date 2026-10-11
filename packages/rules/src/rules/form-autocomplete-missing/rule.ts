import { purposeOf, type ContactPurpose } from '../../lib/address-fields'
import { defineRule, type DetectorFinding } from '../../rule'

/** WCAG 1.3.5's input purposes, as the autocomplete token each takes. */
const TOKEN: Readonly<Record<ContactPurpose, string>> = {
  name: 'name',
  email: 'email',
  tel: 'tel',
  'street-address': 'street-address',
  'address-level2': 'address-level2',
  'postal-code': 'postal-code',
}

/**
 * M6.1: a field that asks for a person's name, email, phone, street, city or postal code, with no
 * `autocomplete` that names it (or `off`). Browsers fill such fields from the visitor's saved
 * details when the token says what the field is, and WCAG 2.2 asks for it (1.3.5 Identify Input
 * Purpose, level AA). The token to write is in the message. Only fields whose purpose is clear
 * from their type, name, id or label are judged.
 */
export const rule = defineRule({
  id: 'form-autocomplete-missing',
  version: '1.0.0',
  category: 'forms',
  severity: 'moderate',
  wcag: ['1.3.5'],
  needs: ['html'],
  messages: ['missing'],
  appliesTo: (page) => (page.html?.fields ?? []).some((field) => purposeOf(field) !== null),
  detect: ({ page }): DetectorFinding<'missing'>[] =>
    (page.html?.fields ?? []).flatMap((field) => {
      const purpose = purposeOf(field)
      if (purpose === null) return []
      const tokens = field.autocomplete.filter((token) => token !== 'off')
      if (tokens.length > 0 && field.autocomplete[0] !== 'off') return []
      return [
        {
          message: 'missing' as const,
          values: { token: TOKEN[purpose], field: field.name ?? field.id ?? field.type },
          selector: field.selector,
          ...(field.snippet === null ? {} : { snippet: field.snippet }),
          ...(field.location === null ? {} : { location: field.location }),
          key: `${field.name ?? ''}:${field.id ?? ''}:${purpose}`,
        },
      ]
    }),
})

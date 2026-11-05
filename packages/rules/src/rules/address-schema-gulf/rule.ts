import {
  entries,
  isEmpty,
  objectsOfTypes,
  shown,
  type Json,
  placeProblems,
  type Problem,
} from '../../lib/jsonld-objects'
import { POSTAL_CODES } from '../../lib/locale-format'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'country-code' | 'postal-digits' | 'postal-shape'

const ADDRESS_TYPES: ReadonlySet<string> = new Set(['PostalAddress'])
const COUNTRY_CODE = /^[A-Z]{2}$/
const EASTERN_DIGITS = /[٠-٩۰-۹]/

const text = (value: Json): string | null => (typeof value === 'string' ? value.trim() : null)

/**
 * M10.1: the postal address in a page's structured data, for the details a Gulf site gets wrong:
 * a country written as a name («السعودية», "Saudi Arabia") where Schema.org and Google ask for the
 * two-letter ISO code, and a postal code written in Eastern Arabic digits, or not the shape the country's post uses (five
 * digits in Saudi Arabia and Kuwait, three in Oman, three or four in Bahrain). The UAE and Qatar have no postal code system and are not judged on it.
 */
export const rule = defineRule({
  id: 'address-schema-gulf',
  version: '1.0.0',
  category: 'schema',
  severity: 'moderate',
  needs: ['html'],
  messages: ['country-code', 'postal-digits', 'postal-shape'],
  appliesTo: (page) => objectsOfTypes(page, ADDRESS_TYPES).length > 0,
  detect: ({ page }): DetectorFinding<Message>[] =>
    placeProblems(
      objectsOfTypes(page, ADDRESS_TYPES).flatMap((address): Problem<Message>[] => {
        const problems: Problem<Message>[] = []
        const countries = entries(address, 'addressCountry').filter(
          (entry) => !isEmpty(entry.value),
        )
        let code: string | null = null
        for (const entry of countries) {
          const value = text(entry.value)
          if (value === null) continue
          if (COUNTRY_CODE.test(value)) code = value
          else
            problems.push({ message: 'country-code', at: entry, values: { country: shown(value) } })
        }
        for (const entry of entries(address, 'postalCode')) {
          const value = text(entry.value)
          if (value === null || value === '') continue
          const expected = code === null ? undefined : POSTAL_CODES[code]
          if (EASTERN_DIGITS.test(value)) {
            problems.push({
              message: 'postal-digits',
              at: entry,
              values: { postalCode: shown(value) },
            })
          } else if (expected !== undefined && code !== null && !expected.pattern.test(value)) {
            problems.push({
              message: 'postal-shape',
              at: entry,
              values: { postalCode: shown(value), country: code, digits: expected.digits },
            })
          }
        }
        return problems
      }),
    ),
})

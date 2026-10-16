import type { PageFacts } from '@arablyzer/collectors'
import { isAddressField } from '../../lib/address-fields'
import { isArabicPage } from '../../lib/arabic'
import { hasPattern, shownPattern, type PatternField } from '../../lib/form-fields'
import { pageTester } from '../../lib/html-pattern'
import { defineRule } from '../../rule'

/**
 * Arabic addresses, each with a Latin one of the same length, so that a limit on length refuses
 * both and is not taken for a refusal of Arabic. They hold what an address in the Gulf holds: a
 * city, a district, a street with its comma, a number after a word.
 */
const ADDRESSES: readonly (readonly [arabic: string, latin: string])[] = [
  ['الرياض', 'Riyadh'],
  ['مسقط', 'Doha'],
  ['حي الروضة', 'Al Rawdah'],
  ['شارع الملك فهد، حي العليا', 'King Fahd Road, Al Olaya'],
  ['مبنى 12، الطابق الثالث', 'Building 12, 3rd Floor'],
]
const VALUES = [...new Set(ADDRESSES.flat())]

/**
 * M6.1: a checkout's address or city field whose `pattern` refuses an Arabic address that it
 * would accept in Latin letters, so a customer who writes the address in Arabic cannot order. The
 * same test the rule about names makes, with addresses.
 */
export const rule = defineRule({
  id: 'form-address-arabic-rejected',
  version: '1.0.0',
  category: 'forms',
  severity: 'serious',
  needs: ['html', 'text'],
  messages: ['rejected'],
  appliesTo: (page) => isArabicPage(page) && addressFields(page).length > 0,
  detect: ({ page }) => {
    if (!isArabicPage(page)) return []
    const test = pageTester()
    return addressFields(page).flatMap((field) => {
      const results = test(field.pattern, VALUES)
      if (typeof results === 'string') return []
      const accepts = (value: string) => results[VALUES.indexOf(value)] === true
      for (const [arabic, latin] of ADDRESSES) {
        if (accepts(arabic) || !accepts(latin)) continue
        return [
          {
            message: 'rejected' as const,
            values: { address: arabic, accepted: latin, pattern: shownPattern(field.pattern) },
            selector: field.selector,
            ...(field.snippet === null ? {} : { snippet: field.snippet }),
            ...(field.location === null ? {} : { location: field.location }),
          },
        ]
      }
      return []
    })
  },
})

function addressFields(page: PageFacts): PatternField[] {
  return (page.html?.fields ?? []).filter(
    (field): field is PatternField => hasPattern(field) && isAddressField(field),
  )
}

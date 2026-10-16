import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'tel-arabic-digits' | 'tel-no-country' | 'tel-invalid' | 'mailto-invalid'

const EASTERN_ARABIC = /[٠-٩۰-۹]/
/** A address as people write it: something, an @, a name with a dot. Nothing is sent to it. */
const ADDRESS = /^[^\s@,;:<>()[\]\\"]+@[^\s@,;:<>()[\]\\"]+\.[^\s@,;:<>()[\]\\"]{2,}$/u

function decoded(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * M6.1: the telephone and email links of a page: `tel:` with its country code and digits 0–9 (the
 * form that dials from anywhere, RFC 3966's global number), a number that can exist in its country
 * (libphonenumber's numbering plans), and a `mailto:` with an address that has an @ and a domain.
 * A phone typed in Eastern Arabic digits looks right and dials nothing.
 */
export const rule = defineRule({
  id: 'contact-link-invalid',
  version: '1.0.0',
  category: 'forms',
  severity: 'minor',
  needs: ['html'],
  messages: ['tel-arabic-digits', 'tel-no-country', 'tel-invalid', 'mailto-invalid'],
  appliesTo: (page) =>
    (page.html?.anchors ?? []).some((anchor) => /^(?:tel|mailto):/i.test(anchor.href.trim())),
  detect: ({ page }) =>
    (page.html?.anchors ?? []).flatMap((anchor): DetectorFinding<Message>[] => {
      const href = anchor.href.trim()
      const where = {
        selector: anchor.selector,
        ...(anchor.snippet === null ? {} : { snippet: anchor.snippet }),
        ...(anchor.location === null ? {} : { location: anchor.location }),
        key: href,
      }
      const tel = /^tel:/i.exec(href)
      if (tel !== null) {
        const number = decoded(href.slice(tel[0].length)).split(';')[0]?.trim() ?? ''
        if (number === '') return []
        const problem = telProblem(number)
        return problem === null ? [] : [{ message: problem, values: { number }, ...where }]
      }
      const mail = /^mailto:/i.exec(href)
      if (mail !== null) {
        const first = decoded(href.slice(mail[0].length).split('?')[0] ?? '')
          .split(',')[0]
          ?.trim()
        if (first === undefined || first === '')
          return [{ message: 'mailto-invalid', values: { address: '' }, ...where }]
        return ADDRESS.test(first)
          ? []
          : [{ message: 'mailto-invalid', values: { address: first }, ...where }]
      }
      return []
    }),
})

function telProblem(number: string): Message | null {
  if (EASTERN_ARABIC.test(number)) return 'tel-arabic-digits'
  const global = number.replace(/^00/, '+')
  if (!global.startsWith('+')) return 'tel-no-country'
  const parsed = parsePhoneNumberFromString(global.replace(/[\s().-]/g, ''))
  return parsed?.isPossible() === true ? null : 'tel-invalid'
}

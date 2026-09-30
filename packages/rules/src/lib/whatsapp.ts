import { parsePhoneNumberFromString } from 'libphonenumber-js'

const SEND_HOSTS = new Set(['api.whatsapp.com', 'web.whatsapp.com', 'whatsapp.com'])

/**
 * The phone number in a WhatsApp click-to-chat link, percent-decoded but otherwise as written;
 * null for other links and for WhatsApp links without a number (wa.me/message/…, the contact
 * picker at wa.me/?text=…).
 */
export function whatsAppNumber(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const web = parsed.protocol === 'https:' || parsed.protocol === 'http:'
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  const segments = parsed.pathname.split('/').filter((segment) => segment !== '')
  if (web && host === 'wa.me' && segments[0] !== 'send') {
    const [first, second, third] = segments.map(decode)
    // wa.me/c/<number> is a catalog, wa.me/p/<product id>/<number> a product; other words
    // (message, qr, catalog, channel…) are links without a number.
    const number = first === 'c' ? second : first === 'p' ? third : first
    return number !== undefined && isPhoneLike(number) ? number : null
  }
  const send =
    (parsed.protocol === 'whatsapp:' && host === 'send') ||
    (web && host === 'wa.me') ||
    (web && SEND_HOSTS.has(host) && /^\/send\/?$/.test(parsed.pathname))
  if (!send) return null
  const phone = queryParam(parsed.search, 'phone')
  return phone === null || phone === '' ? null : phone
}

export type NumberProblem =
  'arabic-digits' | 'not-digits-only' | 'leading-zero' | 'not-international' | 'trunk-zero'

/**
 * WhatsApp's documented form: the full international number, digits only, no +, leading zeros,
 * brackets or dashes (faq.whatsapp.com/5913398998672934). `suggestion` is given only when the
 * fix is mechanical; a local number cannot be completed without guessing its country.
 */
export function checkWhatsAppNumber(
  number: string,
): { problem: NumberProblem; suggestion: string | null } | null {
  const ascii = number
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
  const digits = ascii.replace(/[^0-9]/g, '')
  const suggestion = canonical(digits.startsWith('00') ? digits.slice(2) : digits)
  if (ascii !== number) return { problem: 'arabic-digits', suggestion }
  if (digits !== number) return { problem: 'not-digits-only', suggestion }
  if (number.startsWith('0')) return { problem: 'leading-zero', suggestion }
  const parsed = parsePhoneNumberFromString(`+${number}`)
  if (!parsed?.isPossible()) {
    return { problem: 'not-international', suggestion: null }
  }
  // libphonenumber drops a national prefix it finds after the country code (+966 0501…),
  // WhatsApp's format does not have it.
  const expected = `${parsed.countryCallingCode}${parsed.nationalNumber}`
  if (expected !== number) return { problem: 'trunk-zero', suggestion: expected }
  return null
}

/** Country code + national number, or null when the digits are not a possible number. */
function canonical(digits: string): string | null {
  if (digits === '' || digits.startsWith('0')) return null
  const parsed = parsePhoneNumberFromString(`+${digits}`)
  if (!parsed?.isPossible()) return null
  return `${parsed.countryCallingCode}${parsed.nationalNumber}`
}

/** Digits (any of the three sets) with the separators people type in phone numbers. */
function isPhoneLike(value: string): boolean {
  return (
    /^[0-9\u0660-\u0669\u06f0-\u06f9+\-\s().]+$/.test(value) &&
    /[0-9\u0660-\u0669\u06f0-\u06f9]/.test(value)
  )
}

/** A query parameter with "+" kept as "+": people who type it mean the plus sign. */
function queryParam(search: string, name: string): string | null {
  for (const pair of search.replace(/^\?/, '').split('&')) {
    const eq = pair.indexOf('=')
    if ((eq === -1 ? pair : pair.slice(0, eq)) === name) {
      return eq === -1 ? '' : decode(pair.slice(eq + 1))
    }
  }
  return null
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

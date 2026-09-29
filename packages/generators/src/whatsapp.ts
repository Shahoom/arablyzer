import { checkWhatsAppNumber, type NumberProblem } from '@arablyzer/rules/whatsapp'
import { escapeHtml } from './html'

// The WhatsApp link generator (M2.3b): a click-to-chat link in the form WhatsApp documents, the
// full international number in digits alone, which the whatsapp-link-format rule accepts.

export interface WhatsAppInput {
  /** As people type it: with +, spaces, dashes, a trunk 0, Arabic digits. */
  readonly number: string
  /** The country's calling code, digits alone (968), for a number typed without it. */
  readonly country?: string
  /** A first message, typed by the visitor, if any. */
  readonly text?: string
  /** The link's words in the page. */
  readonly label: string
}

export type WhatsAppResult =
  | { readonly ok: true; readonly number: string; readonly url: string; readonly html: string }
  | { readonly ok: false; readonly problem: NumberProblem }

/** Arabic and Persian digits as Western ones, for what the visitor typed. */
function westernDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
}

export function whatsAppLink(input: WhatsAppInput): WhatsAppResult {
  const typed = westernDigits(input.number).trim()
  const international = typed.startsWith('+') || typed.startsWith('00')
  const digits = typed.replace(/[^0-9]/g, '')
  // A number typed without its country: the country's code, then the number without its trunk 0.
  const candidate =
    international || input.country === undefined || input.country === ''
      ? digits.replace(/^00/, '')
      : `${input.country.replace(/[^0-9]/g, '')}${digits.replace(/^0+/, '')}`
  const check = checkWhatsAppNumber(candidate)
  const number = check === null ? candidate : check.suggestion
  if (number === null || checkWhatsAppNumber(number) !== null) {
    return { ok: false, problem: check?.problem ?? 'not-international' }
  }
  const text = input.text?.trim() ?? ''
  const url = `https://wa.me/${number}${text === '' ? '' : `?text=${encodeURIComponent(text)}`}`
  const html = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(input.label)}</a>`
  return { ok: true, number, url, html }
}

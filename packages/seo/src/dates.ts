import type { Lang } from './site'

/** Month names as used in the Gulf, and in English: fixed, where Intl output follows Node's ICU. */
const MONTHS: Readonly<Record<Lang, readonly string[]>> = {
  ar: [
    'يناير',
    'فبراير',
    'مارس',
    'أبريل',
    'مايو',
    'يونيو',
    'يوليو',
    'أغسطس',
    'سبتمبر',
    'أكتوبر',
    'نوفمبر',
    'ديسمبر',
  ],
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
}

/** YYYY-MM-DD → "24 سبتمبر 2026" / "24 September 2026". */
export function formatDate(iso: string, lang: Lang): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  const date = new Date(`${iso}T00:00:00Z`)
  if (match === null || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
    throw new TypeError(`Not a YYYY-MM-DD date: ${iso}`)
  }
  return `${date.getUTCDate()} ${MONTHS[lang][date.getUTCMonth()] ?? ''} ${date.getUTCFullYear()}`
}

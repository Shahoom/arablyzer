import type { RenderedFieldFact } from '@arablyzer/collectors'
import { fieldTexts, identifierWords } from '../../lib/form-fields'
import { Sightings } from '../../lib/rendered'
import { defineRule } from '../../rule'

const PHONE_WORDS = new Set([
  'phone',
  'telephone',
  'tel',
  'mobile',
  'mob',
  'cell',
  'cellphone',
  'whatsapp',
  'gsm',
  'msisdn',
])
/** Arabic phone words, after the clitics a word carries: «الجوال»، «جوالك»، «بالهاتف». */
const ARABIC_PHONE = new Set(['هاتف', 'جوال', 'موبايل', 'واتساب', 'واتس', 'تلفون', 'تليفون'])
const PREFIX = /^(?:وال|بال|فال|لل|ال|و|ب|ف|ل)/u
const SUFFIX = /(?:كم|كن|هم|ها|نا|ك|ه|ي)$/u
const HARAKAT = /[\u064b-\u065f\u0670]/gu
/** Fields that only mention a phone: a search box, a message. */
const NOT_PHONE_WORDS = new Set([
  'q',
  'query',
  'search',
  'message',
  'msg',
  'comment',
  'comments',
  'note',
  'notes',
  'subject',
  'body',
])

/**
 * A label or placeholder that names a phone, word by word: «iPhone» and «Headphone» are not
 * phones, and plurals such as «جوالات» or «هواتف» are products, not a number (M1.2b review).
 */
function namesPhone(text: string): boolean {
  for (const [word] of text.toLowerCase().matchAll(/[\p{L}\p{M}]+/gu)) {
    if (PHONE_WORDS.has(word)) return true
    const bare = word.replace(HARAKAT, '')
    const stem = bare.replace(PREFIX, '')
    for (const candidate of [bare, stem, bare.replace(SUFFIX, ''), stem.replace(SUFFIX, '')]) {
      if (ARABIC_PHONE.has(candidate)) return true
    }
  }
  return false
}

/** A field for a phone number, by its type, keyboard, autocomplete, name, id or text. */
function isPhoneField(field: RenderedFieldFact): boolean {
  if (field.type === 'search' || identifierWords(field).some((word) => NOT_PHONE_WORDS.has(word))) {
    return false
  }
  return (
    field.type === 'tel' ||
    field.inputmode === 'tel' ||
    field.autocomplete.some((token) => /^tel(?:-|$)/.test(token)) ||
    identifierWords(field).some((word) => PHONE_WORDS.has(word)) ||
    fieldTexts(field).some(namesPhone)
  )
}

/**
 * Shown right to left, a typed «+968 9123 4567» reads «4567 9123 968+» (measured in Chromium 153 and
 * Firefox 155). dir="auto" and unicode-bidi: plaintext take the direction from what is typed, and
 * a number field holds digits alone, which keep their order.
 */
function showsReversed(field: RenderedFieldFact): boolean {
  return (
    field.tag === 'input' &&
    field.type !== 'number' &&
    field.direction === 'rtl' &&
    field.dirAttribute !== 'auto' &&
    field.unicodeBidi !== 'plaintext'
  )
}

export const rule = defineRule({
  id: 'form-phone-direction',
  version: '1.0.0',
  category: 'forms',
  severity: 'moderate',
  needs: ['render'],
  messages: ['reversed'],
  appliesTo: (_page, evidence) =>
    (evidence?.rendered ?? []).some((facts) => facts.fields.some(isPhoneField)),
  detect: ({ rendered = [] }) => {
    const fields = new Sightings<RenderedFieldFact>()
    for (const facts of rendered) {
      for (const field of facts.fields) {
        if (isPhoneField(field) && showsReversed(field))
          fields.add(field.selector, facts.engine, field)
      }
    }
    return [...fields].map(({ key, engines, each }) => {
      const field = engines[0] === undefined ? undefined : each.get(engines[0])
      return {
        message: 'reversed' as const,
        selector: key,
        engines,
        ...(field === undefined ? {} : { box: field.box }),
      }
    })
  },
})

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
/** «رقم الجوال»، «الهاتف»، «واتساب», "Phone number". */
const PHONE_TEXT = /phone|mobile|whats\s?app|هاتف|جوال|موبايل|واتس/iu

/** A field for a phone number, by its type, keyboard, autocomplete, name, id or text. */
function isPhoneField(field: RenderedFieldFact): boolean {
  return (
    field.type === 'tel' ||
    field.inputmode === 'tel' ||
    field.autocomplete.some((token) => /^tel(?:-|$)/.test(token)) ||
    identifierWords(field).some((word) => PHONE_WORDS.has(word)) ||
    fieldTexts(field).some((text) => PHONE_TEXT.test(text))
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

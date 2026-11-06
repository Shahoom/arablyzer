import type { TextSegment } from '@arablyzer/collectors'
import { isArabicText } from '../../lib/arabic'
import { currencyForms, unquoted, type PriceForm } from '../../lib/locale-format'
import { defineRule, type DetectorFinding } from '../../rule'

/**
 * M10.1: a currency written in two forms next to numbers on one Arabic page: «50 ر.س» and
 * «50 SAR», «5 د.ك» and «5 KD». Each is right alone; together they make a shop look unfinished and
 * leave a shopper unsure the two are the same money. One finding for each currency, with the forms
 * and an example of two.
 */
export const rule = defineRule({
  id: 'currency-forms-mixed',
  version: '1.0.0',
  category: 'locale',
  severity: 'minor',
  needs: ['text'],
  messages: ['mixed'],
  appliesTo: (page) => isArabicText(page) && (page.text?.segments.length ?? 0) > 0,
  detect: ({ page }): DetectorFinding<'mixed'>[] => {
    const first = new Map<string, PriceForm & { segment: TextSegment }>()
    for (const segment of page.text?.segments ?? []) {
      if (segment.code) continue
      for (const form of currencyForms(unquoted(segment.text))) {
        const key = `${form.code}:${form.form}`
        if (!first.has(key)) first.set(key, { ...form, segment })
      }
    }
    const byCurrency = new Map<string, (PriceForm & { segment: TextSegment })[]>()
    for (const form of first.values()) {
      byCurrency.set(form.code, [...(byCurrency.get(form.code) ?? []), form])
    }
    return [...byCurrency]
      .filter(([, forms]) => forms.length > 1)
      .map(([code, forms]): DetectorFinding<'mixed'> => {
        const [a, b] = forms
        return {
          message: 'mixed',
          values: {
            currency: code,
            forms: forms.map((form) => form.form).join(' · '),
            first: a?.example ?? '',
            second: b?.example ?? '',
          },
          selector: a?.segment.selector ?? '',
          ...(a?.segment.location === null || a === undefined
            ? {}
            : { location: a.segment.location }),
          key: code,
        }
      })
  },
})

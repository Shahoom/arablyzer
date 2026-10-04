import { COUNTRIES, fitOf, INFO, type Country, type ItemId } from '../../lib/country'
import { defineRule, type DetectorFinding } from '../../rule'

type Message =
  | `fit-${Lowercase<Country>}`
  | 'gap-currency'
  | 'gap-phone-local'
  | 'gap-phone-foreign'
  | 'gap-digits'
  | 'gap-vat'
  | 'gap-hijri'
  | 'gap-lang'

const FIT_MESSAGES = COUNTRIES.map((country) => `fit-${country.toLowerCase()}` as Message)

/**
 * How ready a page is for the Arab country it is written for (docs/design/plans/arabic-native.md
 * §3). Information, never deducted. The country is read from what the page says: its ccTLD, the
 * region of its language tag, a currency that is one country's, and calling codes; it is named
 * only when two kinds of evidence agree and no other country's matches (otherwise the page says
 * too little, and nothing is said). Then each item that page shows something to judge for (its
 * prices' currency, phone numbers, digits, tax, Hijri dates, language tag) is `ok` or a gap; a
 * finding names the readiness and each gap. A page that fits has no findings: the report's facts
 * give its 100%.
 */
export const rule = defineRule({
  id: 'country-fit',
  version: '1.0.0',
  category: 'locale',
  severity: 'info',
  needs: ['html', 'text'],
  messages: [
    ...FIT_MESSAGES,
    'gap-currency',
    'gap-phone-local',
    'gap-phone-foreign',
    'gap-digits',
    'gap-vat',
    'gap-hijri',
    'gap-lang',
  ],
  appliesTo: (page) => page.html !== null && page.text !== null,
  detect: ({ page }): DetectorFinding<Message>[] => {
    const fit = fitOf(page)
    if (fit.country === null || fit.confidence !== 'strong' || fit.percent === null) return []
    const gaps = fit.items.filter((item) => item.status === 'gap')
    if (gaps.length === 0) return []
    const ok = fit.items.filter((item) => item.status === 'ok').length
    const info = INFO[fit.country]
    const summary: DetectorFinding<Message> = {
      message: `fit-${fit.country.toLowerCase()}` as Message,
      values: {
        country: fit.country,
        percent: fit.percent,
        ok,
        judged: fit.judged,
        gaps: gaps.length,
        evidence: fit.signals
          .filter((signal) => signal.country === fit.country)
          .map((signal) => `${signal.kind}: ${signal.value}`)
          .join(' · '),
      },
      key: 'fit',
    }
    const messageOf = (id: ItemId, variant: 'local' | 'foreign' | undefined): Message => {
      switch (id) {
        case 'currency':
          return 'gap-currency'
        case 'phone':
          return variant === 'foreign' ? 'gap-phone-foreign' : 'gap-phone-local'
        case 'digits':
          return 'gap-digits'
        case 'vat':
          return 'gap-vat'
        case 'hijri':
          return 'gap-hijri'
        case 'lang':
          return 'gap-lang'
      }
    }
    return [
      summary,
      ...gaps.map((item): DetectorFinding<Message> => ({
        message: messageOf(item.id, item.variant),
        values: {
          country: fit.country ?? '',
          currency: info.currency,
          dial: info.dial,
          seen: item.detail,
        },
        snippet: item.detail,
        key: item.id,
      })),
    ]
  },
})

import { isMostlyArabic } from '../../lib/arabic'
import { inferCountry, readPage } from '../../lib/country'
import {
  dialectOfPage,
  fitsCountry,
  MIN_WORDS,
  mixedDialects,
  registerGap,
  type Dialect,
} from '../../lib/dialect'
import { defineRule, type DetectorFinding } from '../../rule'

type Message =
  `contradicts-${Dialect}` | 'register-formal-headings' | 'register-colloquial-headings' | 'mixed'

/**
 * The Arabic of the page, Modern Standard or a dialect, against where it is written for
 * (docs/design/plans/arabic-native.md §8). A compact marker lexicon counts the words only one
 * dialect writes (Egyptian إزاي and عايز, Gulf وايد and شلون, Levantine هلق and شو and بدي, Maghrebi
 * بزاف and واش); below MIN_WORDS Arabic words no verdict is given. A finding when the dialect is not
 * the speech of the country the page is for (named by two kinds of evidence, as country-fit
 * does), when the headings are in a different register from the body, or when two dialects mix.
 * The report's facts carry the mix. Minor.
 */
export const rule = defineRule({
  id: 'dialect-register',
  version: '1.0.0',
  category: 'locale',
  severity: 'minor',
  needs: ['html', 'text'],
  messages: [
    'contradicts-gulf',
    'contradicts-egyptian',
    'contradicts-levantine',
    'contradicts-maghrebi',
    'register-formal-headings',
    'register-colloquial-headings',
    'mixed',
  ],
  appliesTo: (page) =>
    page.html !== null &&
    page.text !== null &&
    isMostlyArabic(page) &&
    dialectOfPage(page.text.segments).whole.words >= MIN_WORDS,
  detect: ({ page }): DetectorFinding<Message>[] => {
    const dialect = dialectOfPage(page.text?.segments ?? [])
    const { whole } = dialect
    const findings: DetectorFinding<Message>[] = []
    const first = whole.seen[0]
    const country = inferCountry(readPage(page))
    if (
      whole.label !== null &&
      whole.label !== 'msa' &&
      country.confidence === 'strong' &&
      country.country !== null &&
      !fitsCountry(whole.label, country.country)
    ) {
      findings.push({
        message: `contradicts-${whole.label}`,
        values: {
          country: country.country,
          hits: whole.hits[whole.label],
          example: first?.word ?? '',
        },
        snippet: first?.word ?? '',
        key: 'country',
      })
    }
    const gap = registerGap(dialect)
    if (gap !== null) {
      const marked = (gap === 'formal-headings' ? dialect.body : dialect.headings)?.seen[0]
      findings.push({
        message: `register-${gap}`,
        values: { example: marked?.word ?? '' },
        snippet: marked?.word ?? '',
        key: 'register',
      })
    }
    const mixed = mixedDialects(whole)
    if (mixed.length >= 2) {
      const [a, b] = mixed.map(
        (name) => whole.seen.find((seen) => seen.dialect === name)?.word ?? '',
      )
      findings.push({
        message: 'mixed',
        values: { first: a ?? '', second: b ?? '' },
        snippet: `${a ?? ''} / ${b ?? ''}`,
        key: 'mixed',
      })
    }
    return findings
  },
})

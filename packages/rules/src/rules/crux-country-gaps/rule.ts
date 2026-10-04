import type { CruxMetric } from '@arablyzer/collectors'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = CruxMetric

/** Core Web Vitals passes when at least this share of page loads is good (web.dev/vitals). */
export const PASS_SHARE = 0.75

/**
 * Real visitors' experience of the site in each Arab country (docs/design/plans/arabic-native.md
 * §14), from the Chrome UX Report's per-country tables in BigQuery, phones. One finding for each
 * metric (LCP, INP, CLS) that fewer than 75% of page loads have good in at least one country, naming
 * the countries and their shares. Asked only in a tool's scan, with BigQuery credentials (needs
 * `crux-countries`). Minor: the country's connections and phones are not the site's to command.
 */
export const rule = defineRule({
  id: 'crux-country-gaps',
  version: '1.0.0',
  category: 'speed',
  severity: 'minor',
  needs: ['crux-countries'],
  messages: ['lcp', 'inp', 'cls'],
  appliesTo: (_page, evidence) => {
    const facts = evidence?.outside?.cruxCountries
    return facts?.outcome === 'checked' && facts.countries.some((country) => country.found)
  },
  detect: ({ outside }): DetectorFinding<Message>[] => {
    const facts = outside?.cruxCountries
    if (facts?.outcome !== 'checked') return []
    return (['lcp', 'inp', 'cls'] as const).flatMap((metric): DetectorFinding<Message>[] => {
      const below = facts.countries.flatMap((country) => {
        const share = country.good[metric]
        return country.found && share !== null && share < PASS_SHARE
          ? [{ code: country.country, percent: Math.round(share * 100) }]
          : []
      })
      if (below.length === 0) return []
      return [
        {
          message: metric,
          values: {
            countries: below.map((item) => `${item.code} ${String(item.percent)}%`).join(', '),
            count: below.length,
            month: facts.month,
          },
          key: metric,
        },
      ]
    })
  },
})

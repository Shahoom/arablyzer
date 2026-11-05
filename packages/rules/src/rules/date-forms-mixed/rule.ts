import { isArabicText } from '../../lib/arabic'
import { monthFamilies, numericDates, unquoted } from '../../lib/locale-format'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'month-names' | 'numeric'

/**
 * M10.1: dates written two ways on one Arabic page. The months of the Levant and Iraq («كانون
 * الثاني»، «آذار») beside the months of the Gulf and Egypt («يناير»، «مارس»), which readers of
 * one region meet as foreign; or the numeric form 2026-03-05 beside 05/03/2026. A month name counts
 * only beside a day or a year, so a word that spells like one is not taken for a date.
 */
export const rule = defineRule({
  id: 'date-forms-mixed',
  version: '1.0.0',
  category: 'locale',
  severity: 'minor',
  needs: ['text'],
  messages: ['month-names', 'numeric'],
  appliesTo: (page) => isArabicText(page) && (page.text?.segments.length ?? 0) > 0,
  detect: ({ page }): DetectorFinding<Message>[] => {
    const text = (page.text?.segments ?? [])
      .filter((segment) => !segment.code)
      .map((segment) => unquoted(segment.text))
      .join('\n')
    const months = monthFamilies(text)
    const dates = numericDates(text)
    const findings: DetectorFinding<Message>[] = []
    if (months.levant !== null && months.gulf !== null) {
      findings.push({
        message: 'month-names',
        values: { levant: months.levant, gulf: months.gulf },
      })
    }
    if (dates.iso !== null && dates.slash !== null) {
      findings.push({ message: 'numeric', values: { iso: dates.iso, slash: dates.slash } })
    }
    return findings
  },
})

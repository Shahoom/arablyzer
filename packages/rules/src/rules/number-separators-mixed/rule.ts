import { isArabicText } from '../../lib/arabic'
import { numberMarks, unquoted } from '../../lib/locale-format'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'mixed' | 'arabic-comma'

/**
 * M10.1: the marks inside numbers on one Arabic page. The Arabic decimal and thousands marks
 * (١٬٢٥٠٫٥٠) beside the Latin ones (1,250.50): a shopper reads the second number as a different
 * kind of figure. And the Arabic comma between digits (1،500), which is punctuation, not a
 * thousands mark, and which people and programs read as two numbers.
 */
export const rule = defineRule({
  id: 'number-separators-mixed',
  version: '1.0.0',
  category: 'locale',
  severity: 'minor',
  needs: ['text'],
  messages: ['mixed', 'arabic-comma'],
  appliesTo: (page) => isArabicText(page) && (page.text?.segments.length ?? 0) > 0,
  detect: ({ page }): DetectorFinding<Message>[] => {
    const text = (page.text?.segments ?? [])
      .filter((segment) => !segment.code)
      .map((segment) => unquoted(segment.text))
      .join('\n')
    const marks = numberMarks(text)
    const findings: DetectorFinding<Message>[] = []
    if (marks.arabic !== null && marks.latin !== null) {
      findings.push({ message: 'mixed', values: { arabic: marks.arabic, latin: marks.latin } })
    }
    if (marks.arabicComma !== null) {
      findings.push({ message: 'arabic-comma', values: { example: marks.arabicComma } })
    }
    return findings
  },
})

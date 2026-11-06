import {
  entries,
  objects,
  objectsOfTypes,
  placeProblems,
  type Json,
  type Located,
  type Problem,
} from '../../lib/jsonld-objects'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'question' | 'answer'

const FAQ: ReadonlySet<string> = new Set(['FAQPage'])

/**
 * Text without markup, without any whitespace, case folded: a page puts a space where its markup
 * has two nodes side by side (`<b>فقط</b>.`), so the two texts are compared by their letters alone.
 */
function plain(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, '')
    .toLowerCase()
}

const text = (value: Json): string => (typeof value === 'string' ? value : '')

/** How much of an answer must stand on the page (letters, not spaces): the start of it, so a long answer is not compared whole. */
const ANSWER_START = 50

/**
 * M10.2: a FAQPage whose questions or answers are not in the page's visible text. Google asks that
 * the markup describe what the visitor sees, and treats markup for hidden content as spam; and an
 * answer a script draws after the page loads is not in the HTML an assistant or a crawler reads.
 * One finding for each kind, with how many and the first question.
 */
export const rule = defineRule({
  id: 'faq-schema-mismatch',
  version: '1.0.0',
  category: 'schema',
  severity: 'moderate',
  needs: ['html', 'text'],
  messages: ['question', 'answer'],
  appliesTo: (page) => page.text !== null && objectsOfTypes(page, FAQ).length > 0,
  detect: ({ page }): DetectorFinding<Message>[] => {
    const visible = plain((page.text?.segments ?? []).map((segment) => segment.text).join(' '))
    const problems: Problem<Message>[] = []
    for (const faq of objectsOfTypes(page, FAQ)) {
      for (const question of objects(entries(faq, 'mainEntity'))) {
        const name = entries(question, 'name')[0]
        const label = plain(text(name?.value ?? null))
        if (name === undefined || label === '') continue
        const shown = text(name.value).replace(/\s+/g, ' ').trim().slice(0, 60)
        if (!visible.includes(label)) {
          problems.push({ message: 'question', at: name, values: { question: shown } })
          continue
        }
        const answer: Located | undefined = objects(entries(question, 'acceptedAnswer'))
          .map((accepted) => entries(accepted, 'text')[0])
          .find((entry) => entry !== undefined)
        const start = plain(text(answer?.value ?? null)).slice(0, ANSWER_START)
        if (answer !== undefined && start !== '' && !visible.includes(start)) {
          problems.push({ message: 'answer', at: answer, values: { question: shown } })
        }
      }
    }
    const placed = placeProblems(problems)
    return (['question', 'answer'] as const).flatMap((message): DetectorFinding<Message>[] => {
      const hits = placed.filter((finding) => finding.message === message)
      const [first] = hits
      return first === undefined
        ? []
        : [{ ...first, values: { ...first.values, count: hits.length }, key: message }]
    })
  },
})

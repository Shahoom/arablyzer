import { isMostlyArabic } from '../../lib/arabic'
import { FINEWEB2, readTraining, trainingText, type FilterCheck } from '../../lib/ai-training'
import { defineRule, type DetectorFinding } from '../../rule'

type Message =
  | 'repetition'
  | 'line-endings'
  | 'repeated-lines'
  | 'list-like'
  | 'word-length'
  | 'symbols'
  | 'alpha'
  | 'stop-words'
  | 'length'

const MESSAGE_OF = (id: string): Message => {
  if (id === 'line_punct_ratio') return 'line-endings'
  if (id === 'char_dup_ratio') return 'repeated-lines'
  if (id === 'list_ratio') return 'list-like'
  if (id.startsWith('gopher_avg_word_length')) return 'word-length'
  if (id === 'gopher_below_alpha_threshold') return 'alpha'
  if (id === 'gopher_enough_stop_words') return 'stop-words'
  if (id === 'gopher_short_doc' || id === 'gopher_long_doc') return 'length'
  if (id.startsWith('gopher_too_many')) return 'symbols'
  return 'repetition'
}

/**
 * Whether the page's text would survive the quality filters of the FineWeb-2 pipeline for Arabic
 * (docs/design/plans/arabic-native.md §11): Gopher repetition, FineWeb quality and Gopher quality,
 * with the thresholds of FineWeb-2's `configs/arb_Arab.yml` (sources and differences in
 * lib/ai-training.ts). A text that fails is dropped from the corpus models learn from. One finding
 * for each kind of check that failed, naming the first and how many failed. Applies to an Arabic
 * page with the 50 words the pipeline asks for; a shorter text is "too little text", which the
 * report's fact says. Minor.
 */
export const rule = defineRule({
  id: 'ai-training-filters',
  version: '1.0.0',
  category: 'ai',
  severity: 'minor',
  needs: ['html', 'text'],
  messages: [
    'repetition',
    'line-endings',
    'repeated-lines',
    'list-like',
    'word-length',
    'symbols',
    'alpha',
    'stop-words',
    'length',
  ],
  appliesTo: (page) =>
    page.html !== null &&
    page.text !== null &&
    isMostlyArabic(page) &&
    readTraining(trainingText(page)).words >= FINEWEB2.minDocWords,
  detect: ({ page }): DetectorFinding<Message>[] => {
    const failed = readTraining(trainingText(page)).checks.filter(
      (item) => item.applied && !item.pass,
    )
    const byMessage = new Map<Message, FilterCheck[]>()
    for (const item of failed) {
      const message = MESSAGE_OF(item.id)
      byMessage.set(message, [...(byMessage.get(message) ?? []), item])
    }
    return [...byMessage.entries()].map(([message, items]): DetectorFinding<Message> => {
      const [first] = items
      if (first === undefined) return { message, key: message }
      return {
        message,
        values: {
          check: first.id,
          measured: first.measured,
          threshold: first.threshold,
          count: items.length,
        },
        snippet: first.id,
        key: message,
      }
    })
  },
})

import { SPELLING_FAMILIES, type NlpSpelling, type SpellingFamily } from '@arablyzer/collectors'
import { arabicWords, normalizeArabic } from '../../lib/ar-normalize'
import { isMostlyArabic } from '../../lib/arabic'
import { collectBrandNames } from '../../lib/brand-names'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = SpellingFamily

/** The most spelling findings one page reports: past a handful, the page needs a proofreader, not a list. */
export const MAX_REPORTED = 20

/**
 * Arabic spelling slips the Arabic NLP service is sure of (docs/design/plans/m7-deep-arabic.md):
 * a hamza left off («الاسعار»), ه for ة («المدرسه»), ي for ى («مستشفي»), a tanween on the wrong
 * letter, a doubled letter, «انشاء الله». Precision first: the service reports a word only when the
 * morphology database knows it as a variant of another spelling, the written form is no word of
 * its own, and the fix is clearly the likelier; names, brands, Gulf and other dialect speech,
 * quotations, addresses and code are left alone, and so is any word of the page's own brand names.
 * The confidence is the service's, 0.9 by default (ARABLYZER_SPELLING_MIN_CONFIDENCE). Never
 * deducted more than a moderate finding; a page with none of these is not proofread, only free of
 * the slips the service is sure of.
 */
export const rule = defineRule({
  id: 'ar-spelling',
  version: '1.0.0',
  category: 'ar-content',
  severity: 'moderate',
  needs: ['html', 'text', 'nlp'],
  messages: [...SPELLING_FAMILIES],
  appliesTo: (page, evidence) =>
    page.html !== null &&
    page.text !== null &&
    isMostlyArabic(page) &&
    (evidence === undefined || evidence.nlp?.spelling != null),
  detect: ({ page, nlp }): DetectorFinding<Message>[] => {
    const spelling = nlp?.spelling
    if (spelling === null || spelling === undefined) return []
    const names = brandWords(page)
    // One finding for each word and its fix, with how often the page writes it.
    const groups = new Map<string, { first: NlpSpelling; count: number }>()
    for (const item of spelling.findings) {
      if (names.has(normalizeArabic(item.word)) || item.confidence < spelling.minConfidence)
        continue
      const key = `${item.word}\u0000${item.suggestion}`
      const group = groups.get(key)
      if (group === undefined) groups.set(key, { first: item, count: 1 })
      else group.count += 1
    }
    return [...groups.values()]
      .sort(
        (a, b) =>
          b.first.confidence - a.first.confidence || a.first.word.localeCompare(b.first.word, 'ar'),
      )
      .slice(0, MAX_REPORTED)
      .map(({ first, count }) => ({
        message: first.family,
        values: {
          word: first.word,
          suggestion: first.suggestion,
          confidence: Math.round(first.confidence * 100),
          count,
          context: `${first.before} ${first.word} ${first.after}`.trim(),
        },
        snippet: `${first.before} ${first.word} ${first.after}`.trim(),
        key: first.word,
      }))
  },
})

/** The words of every name the page gives its brand: a name is spelled as its owner spells it. */
function brandWords(page: Parameters<typeof collectBrandNames>[0]): Set<string> {
  const names = collectBrandNames(page)
  const texts = names.candidates.map((candidate) => candidate.name)
  return new Set(texts.flatMap((text) => arabicWords(text)).map((word) => normalizeArabic(word)))
}

import type { PageFacts } from '@arablyzer/collectors'
import { PUNCTUATION, TERMINAL_PUNCTUATION } from './datatrove-text'

/**
 * The quality filters of the published FineWeb-2 pipeline, for Arabic (`arb_Arab`), run on a
 * page's text (docs/design/plans/arabic-native.md §11). Sources, all read once on 2026-10-04:
 *
 * - The pipeline: https://github.com/huggingface/fineweb-2/blob/d0defb24f193bb9a5a11b8b14524a03c4858e1b6/fineweb-2-pipeline.py
 *   (step 5: GopherRepetitionFilter with the paragraph filters off, FineWebQualityFilter with
 *   `short_line_thr=999` (off) and `char_duplicates_ratio=0.1`, GopherQualityFilter with
 *   `min_stop_words=2`; "we do not apply the C4 filters").
 * - The per-language thresholds: https://github.com/huggingface/fineweb-2/blob/d0defb24f193bb9a5a11b8b14524a03c4858e1b6/configs/arb_Arab.yml
 *   (language_score, dup_line_frac, top_n_grams, dup_n_grams, line_punct_thr, new_line_ratio,
 *   min/max_avg_word_length, max_non_alpha_words_ratio and the stop words), at commit d0defb24f193.
 * - The filters themselves: https://github.com/huggingface/datatrove/tree/1977fbb0f3c163d43cace334b073dda17fa3ef26/src/datatrove/pipeline/filters
 *   (gopher_quality_filter.py, gopher_repetition_filter.py, fineweb_quality_filter.py,
 *   c4_filters.py) at commit 1977fbb0f3c1 (2026-09-30), whose defaults supply every threshold the
 *   YAML does not name (min_doc_words 50, max_doc_words 100000, max_symbol_word_ratio 0.1,
 *   bullet lines 0.9, ellipsis lines 0.3, short_line_length 30 and C4's own).
 *
 * Differences from the pipeline, said on every report:
 * - Language ID is GlotLID (fastText) there; it cannot run here, so `language` is a proxy: the
 *   share of the text's letters that are Arabic-script, held to the same 0.711 threshold. It
 *   does not tell Arabic from Persian or Urdu, which share the script.
 * - Words are spaCy's blank `ar` tokenizer's; `tokenize` approximates it (runs of letters, marks
 *   and digits, and every other mark on its own).
 * - The text there is Trafilatura's main content; here it is the page's visible text outside
 *   nav, header, footer and aside, one line for each block of the page.
 * - The C4 filters are not part of the FineWeb-2 pipeline; they are run as a reference
 *   (`applied: false`) and never decide the verdict.
 */

export const FINEWEB2 = {
  languageScore: 0.711,
  dupLineFrac: 0.304,
  topNGrams: [
    [2, 0.197],
    [3, 0.172],
    [4, 0.146],
  ],
  dupNGrams: [
    [5, 0.165],
    [6, 0.153],
    [7, 0.142],
    [8, 0.131],
    [9, 0.12],
    [10, 0.109],
  ],
  linePunctThr: 0.143,
  charDuplicatesRatio: 0.1,
  newLineRatio: 0.189,
  minAvgWordLength: 2,
  maxAvgWordLength: 9,
  maxNonAlphaWordsRatio: 0.787,
  minStopWords: 2,
  stopWords: [
    '،',
    'في',
    'من',
    'على',
    'إلى',
    'عام',
    'أن',
    'مع',
    'أو',
    'هو',
    'عن',
    'التي',
    'كان',
    'بين',
    'ما',
    'كانت',
    'هي',
    'المتحدة',
    'بعد',
  ],
  // datatrove defaults the pipeline leaves in place.
  minDocWords: 50,
  maxDocWords: 100_000,
  maxSymbolWordRatio: 0.1,
  maxBulletLinesRatio: 0.9,
  maxEllipsisLinesRatio: 0.3,
} as const

export type FilterGroup =
  'language' | 'gopher-repetition' | 'fineweb-quality' | 'gopher-quality' | 'c4'

export interface FilterCheck {
  readonly group: FilterGroup
  /** datatrove's name for the sub-check (`dup_line_frac`, `gopher_short_doc`, ...). */
  readonly id: string
  readonly measured: number
  readonly threshold: number
  /** `max`: it passes while measured is at most the threshold; `min`: at least. */
  readonly limit: 'max' | 'min'
  readonly pass: boolean
  /** False for the language proxy and the C4 reference: shown, never the verdict by themselves. */
  readonly applied: boolean
  /** True where the measure is our proxy for what the pipeline computes. */
  readonly proxy: boolean
}

export interface TrainingReading {
  readonly words: number
  readonly lines: number
  readonly checks: readonly FilterCheck[]
  /** Every applied check passed. */
  readonly passes: boolean
}

const PUNCT = new Set(Array.from(PUNCTUATION + TERMINAL_PUNCTUATION))
const TERMINAL = new Set(Array.from(TERMINAL_PUNCTUATION))
const STOP = new Set<string>(FINEWEB2.stopWords)

/** Code points, as Python's len counts. */
const length = (text: string) => Array.from(text).length

/** spaCy's blank Arabic tokenizer, approximately: a word is a run of letters/marks/digits. */
export function tokenize(text: string): string[] {
  return text.match(/[\p{L}\p{M}\p{N}_]+|[^\s\p{L}\p{M}\p{N}_]/gu) ?? []
}

const SKIPPED_ANCESTORS = /(?:^|>)\s*(?:nav|footer|header|aside)(?![\w-])/i

/**
 * The page's text as the filters see it: a line for each block, boilerplate left out. Segments
 * that continue a block (`precededBy` is not empty) join the line before them.
 */
export function trainingText(page: PageFacts): string {
  const lines: string[] = []
  let current: string | null = null
  const close = () => {
    if (current !== null) lines.push(current)
    current = null
  }
  for (const segment of page.text?.segments ?? []) {
    if (segment.code || SKIPPED_ANCESTORS.test(segment.selector)) {
      close()
      continue
    }
    const text = segment.text.replace(/\s+/g, ' ')
    if (current !== null && segment.precededBy !== '') current += text
    else {
      close()
      current = text
    }
  }
  close()
  return lines
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join('\n')
}

function findDuplicates(items: readonly string[]): { elements: number; chars: number } {
  const seen = new Set<string>()
  let elements = 0
  let chars = 0
  for (const item of items) {
    if (seen.has(item)) {
      chars += length(item)
      elements++
    } else seen.add(item)
  }
  return { elements, chars }
}

const nGrams = (words: readonly string[], n: number): string[] =>
  Array.from({ length: Math.max(0, words.length - n + 1) }, (_, i) =>
    words.slice(i, i + n).join(' '),
  )

function topDuplicateChars(grams: readonly string[]): number {
  const counts = new Map<string, number>()
  for (const gram of grams) counts.set(gram, (counts.get(gram) ?? 0) + 1)
  let best = 0
  for (const [gram, count] of counts) best = Math.max(best, length(gram) * count)
  return best
}

function allDuplicateChars(words: readonly string[], n: number): number {
  const unique = new Set<string>()
  let repeated = 0
  let index = 0
  while (index < words.length - n + 1) {
    const gram = words.slice(index, index + n).join('')
    if (unique.has(gram)) {
      repeated += length(gram)
      index += n
    } else {
      unique.add(gram)
      index++
    }
  }
  return repeated
}

const ratio = (part: number, whole: number) => (whole === 0 ? 0 : part / whole)

const check = (
  group: FilterGroup,
  id: string,
  measured: number,
  threshold: number,
  limit: 'max' | 'min',
  options: { applied?: boolean; proxy?: boolean } = {},
): FilterCheck => ({
  group,
  id,
  measured: Math.round(measured * 1000) / 1000,
  threshold,
  limit,
  pass: limit === 'max' ? measured <= threshold : measured >= threshold,
  applied: options.applied ?? true,
  proxy: options.proxy ?? false,
})

const C4_TERMINAL = ['.', '?', '!', '"', "'"]
const CITATION = /\[\d*]|\[edit]|\[citation needed]/g
const POLICY = [
  'terms of use',
  'privacy policy',
  'cookie policy',
  'uses cookies',
  'use of cookies',
  'use cookies',
]

/** Runs the filters of the FineWeb-2 pipeline for Arabic, and the C4 reference, on a text. */
export function readTraining(text: string): TrainingReading {
  const c = FINEWEB2
  const words = tokenize(text)
  const lines = text.split(/\n+/)
  const checks: FilterCheck[] = []
  const letters = text.match(/\p{L}/gu)?.length ?? 0
  const arabic = text.match(/\p{Script=Arabic}(?<=\p{L})/gu)?.length ?? 0
  checks.push(
    check('language', 'language_score', ratio(arabic, letters), c.languageScore, 'min', {
      applied: false,
      proxy: true,
    }),
  )

  // GopherRepetitionFilter (paragraph checks off).
  const duplicateLines = findDuplicates(lines)
  checks.push(
    check(
      'gopher-repetition',
      'dup_line_frac',
      ratio(duplicateLines.elements, lines.length),
      c.dupLineFrac,
      'max',
    ),
  )
  const characters = length(text)
  for (const [n, limit] of c.topNGrams) {
    const grams = nGrams(words, n)
    checks.push(
      check(
        'gopher-repetition',
        `top_${String(n)}_gram`,
        grams.length === 0 ? 0 : ratio(topDuplicateChars(grams), characters),
        limit,
        'max',
      ),
    )
  }
  for (const [n, limit] of c.dupNGrams) {
    checks.push(
      check(
        'gopher-repetition',
        `duplicated_${String(n)}_n_grams`,
        ratio(allDuplicateChars(words, n), characters),
        limit,
        'max',
      ),
    )
  }

  // FineWebQualityFilter (short lines off, character duplicates at 0.1).
  const textLines = text.split('\n').filter((line) => line.trim() !== '')
  const terminal = textLines.filter((line) => {
    const last = Array.from(line).at(-1)
    return last !== undefined && TERMINAL.has(last)
  }).length
  checks.push(
    check(
      'fineweb-quality',
      'line_punct_ratio',
      ratio(terminal, textLines.length),
      c.linePunctThr,
      'min',
    ),
  )
  checks.push(
    check(
      'fineweb-quality',
      'char_dup_ratio',
      ratio(findDuplicates(textLines).chars, length(text.replace(/\n/g, ''))),
      c.charDuplicatesRatio,
      'max',
    ),
  )
  const newlines = text.split('\n').length - 1
  checks.push(
    check('fineweb-quality', 'list_ratio', ratio(newlines, words.length), c.newLineRatio, 'max'),
  )

  // GopherQualityFilter.
  const nonSymbol = words.filter((word) => Array.from(word).some((ch) => !PUNCT.has(ch)))
  checks.push(check('gopher-quality', 'gopher_short_doc', nonSymbol.length, c.minDocWords, 'min'))
  checks.push(check('gopher-quality', 'gopher_long_doc', nonSymbol.length, c.maxDocWords, 'max'))
  const average =
    nonSymbol.length === 0
      ? 0
      : nonSymbol.reduce((sum, word) => sum + length(word), 0) / nonSymbol.length
  checks.push(
    check('gopher-quality', 'gopher_avg_word_length_min', average, c.minAvgWordLength, 'min'),
  )
  checks.push(
    check('gopher-quality', 'gopher_avg_word_length_max', average, c.maxAvgWordLength, 'max'),
  )
  const wordCount = Math.max(1, words.length)
  checks.push(
    check(
      'gopher-quality',
      'gopher_too_many_hashes',
      ratio(text.split('#').length - 1, wordCount),
      c.maxSymbolWordRatio,
      'max',
    ),
  )
  checks.push(
    check(
      'gopher-quality',
      'gopher_too_many_ellipsis',
      ratio(text.split('...').length - 1 + text.split('…').length - 1, wordCount),
      c.maxSymbolWordRatio,
      'max',
    ),
  )
  const bullets = lines.filter((line) => /^\s*[•-]/.test(line)).length
  checks.push(
    check(
      'gopher-quality',
      'gopher_too_many_bullets',
      ratio(bullets, lines.length),
      c.maxBulletLinesRatio,
      'max',
    ),
  )
  const ellipsisEnds = lines.filter((line) => /(?:\.\.\.|…)\s*$/.test(line)).length
  checks.push(
    check(
      'gopher-quality',
      'gopher_too_many_end_ellipsis',
      ratio(ellipsisEnds, lines.length),
      c.maxEllipsisLinesRatio,
      'max',
    ),
  )
  const alpha = words.filter((word) => /\p{L}/u.test(word)).length
  checks.push(
    check(
      'gopher-quality',
      'gopher_below_alpha_threshold',
      ratio(alpha, wordCount),
      c.maxNonAlphaWordsRatio,
      'min',
    ),
  )
  const stops = new Set(words.filter((word) => STOP.has(word))).size
  checks.push(check('gopher-quality', 'gopher_enough_stop_words', stops, c.minStopWords, 'min'))

  // C4QualityFilter, datatrove's defaults: a reference only (the pipeline does not apply it).
  let kept = 0
  let sentences = 0
  let lineTotal = 0
  let curly = false
  let lorem = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    lineTotal++
    const lineWords = line.split(/\s+/).filter((word) => word !== '')
    if (lineWords.some((word) => length(word) > 1000)) continue
    const stripped = line.replace(CITATION, '')
    if (!C4_TERMINAL.some((mark) => stripped.endsWith(mark)) || stripped.endsWith('...')) continue
    if (lineWords.length < 3) continue
    const lower = stripped.toLowerCase()
    if (lower.includes('lorem ipsum')) lorem = true
    if (lower.includes('javascript')) continue
    if (stripped.includes('{')) curly = true
    if (POLICY.some((phrase) => lower.includes(phrase))) continue
    sentences += Math.max(1, (stripped.match(/[.!?؟]+/g) ?? []).length)
    kept++
  }
  checks.push(
    check('c4', 'line_kept_ratio', ratio(kept, lineTotal), 0, 'min', {
      applied: false,
      proxy: true,
    }),
  )
  checks.push(
    check('c4', 'too_few_sentences', sentences, 5, 'min', { applied: false, proxy: true }),
  )
  checks.push(
    check('c4', 'lorem_ipsum_or_curly_bracket', lorem || curly ? 1 : 0, 0, 'max', {
      applied: false,
    }),
  )

  return {
    words: nonSymbol.length,
    lines: lines.length,
    checks,
    passes: checks.every((item) => !item.applied || item.pass),
  }
}

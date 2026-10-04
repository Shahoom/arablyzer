import type { PdfIssue } from '@arablyzer/collectors'
import { arabicWords, normalizeArabic } from '@arablyzer/rules'

/**
 * What is wrong with the Arabic of a PDF, from the text pdf.js reads out of it
 * (docs/design/plans/arabic-native.md §10). Pure: the text of each page, and the document's title
 * and language, in; the issues out. Heuristics, each said where it is made.
 */

export interface PdfText {
  /** The text of each page read (at most 20), as pdf.js returns it. */
  readonly pages: readonly string[]
  readonly title: string | null
  readonly language: string | null
  /** The link text of the PDF on the page, or its address: tells a document meant to be Arabic. */
  readonly arabicHint: boolean
}

/** Letters this many of the PDF's characters decide a check; below it there is too little to say. */
const MIN_CHARS = 20
const BASE_ARABIC = new RegExp('[\\u0621-\\u064A\\u066E-\\u06D3\\u06FA-\\u06FF]', 'gu')
const PRESENTATION = new RegExp('[\\uFB50-\\uFDFF\\uFE70-\\uFEFF]', 'gu')
const PRIVATE_USE = new RegExp('[\\uE000-\\uF8FF]', 'gu')
const REPLACEMENT = new RegExp('\\uFFFD', 'gu')
const LATIN1_LETTERS = new RegExp('[\\u00C0-\\u00FF]', 'gu')

/**
 * Frequent Modern Standard words, in the folded letters of normalizeArabic. A word of a PDF that
 * is not in the list but whose reverse is, is evidence that the text is in visual order.
 */
const COMMON_WORDS = new Set(
  'في من على الى عن ان هذا هذه ذلك تلك التي الذي الذين كان كانت يكون تكون هو هي هم بين بعد قبل عند حتى مع كل او ثم قد لقد لم لن ما لكن ايضا حيث كما فقط جميع بعض غير بدون خلال نحو حول منذ هنا هناك الان اليوم السنه العام الشركه الخدمات المنتجات الموقع الصفحه المعلومات التقرير الدوله وزاره المملكه الحكومه العربيه السعوديه المتحده مصر الوطني الاجتماعي الاقتصادي التعليم الصحه الامن العمل المشروع البرنامج الخطه الميزانيه القرار اللجنه المجلس الاداره الهيئه المؤسسه الجامعه الطلاب الطالب المدرسه الكتاب المادي البند الفصل الباب القسم الجدول الشكل الملحق المراجع الخاتمه المقدمه الهدف النتائج التوصيات للاطلاع شروط الاحكام حقوق محفوظه رقم تاريخ اسم نموذج طلب عقد اتفاقيه فاتوره سعر مبلغ ريال درهم دينار جنيه'
    .split(/\s+/)
    .map(normalizeArabic),
)

const reverse = (word: string) => Array.from(word).reverse().join('')
const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0

/** Characters that show a text is not read out right, for the issue's example. */
const firstOf = (text: string, pattern: RegExp, length = 12) =>
  (text.match(pattern) ?? []).slice(0, length).join('')

export function judgePdf(input: PdfText): PdfIssue[] {
  const issues: PdfIssue[] = []
  const texts = input.pages
  const text = texts.join('\n')
  const visible = text.replace(/\s+/gu, '')
  const emptyPages = texts.filter((page) => page.trim() === '').length

  // Pages with no text at all: a scan or a picture of text, which no machine reads.
  if (texts.length > 0 && emptyPages / texts.length >= 0.5) {
    issues.push({ kind: 'image-only', measure: emptyPages / texts.length, example: '' })
  }

  if (visible.length >= MIN_CHARS) {
    const arabic = count(text, BASE_ARABIC)
    const presentation = count(text, PRESENTATION)
    const privateUse = count(text, PRIVATE_USE) + count(text, REPLACEMENT)
    const latin1 = count(text, LATIN1_LETTERS)

    // No ToUnicode map: the font's glyph codes come out as private-use characters, replacement
    // characters, or, for a legacy Arabic font, accented Latin letters (the cp1256 reading).
    const garbage = privateUse / visible.length
    const legacy =
      input.arabicHint && latin1 / visible.length >= 0.3 && arabic / visible.length < 0.05
    if (garbage >= 0.05 || legacy) {
      issues.push({
        kind: 'no-unicode-map',
        measure: garbage >= 0.05 ? garbage : latin1 / visible.length,
        example: firstOf(text, garbage >= 0.05 ? PRIVATE_USE : LATIN1_LETTERS),
      })
    }

    // Presentation forms: the glyph shapes (initial, medial, final) instead of the base letters.
    if (presentation + arabic >= MIN_CHARS && presentation / (presentation + arabic) >= 0.2) {
      issues.push({
        kind: 'presentation-forms',
        measure: presentation / (presentation + arabic),
        example: firstOf(text, PRESENTATION),
      })
    }

    // Visual order: the words come out letter-reversed. A word the list knows backwards and not
    // forwards, and words that begin with ة, which no Arabic word does.
    const words = arabicWords(text.normalize('NFKC'))
    let forward = 0
    let backward = 0
    let example = ''
    for (const word of words) {
      if (word.length < 2) continue
      if (COMMON_WORDS.has(word)) forward++
      else if (COMMON_WORDS.has(reverse(word))) {
        backward++
        if (example === '') example = reverse(word)
      }
    }
    const taMarbutaStarts = (text.normalize('NFKC').match(/(?:^|[\s\p{P}])ة[ء-ي]/gu) ?? []).length
    if ((backward >= 3 && backward >= 2 * forward) || taMarbutaStarts >= 3) {
      issues.push({
        kind: 'reversed',
        measure: backward / Math.max(1, backward + forward),
        example: example === '' ? firstOf(text.normalize('NFKC'), /ة[ء-ي]+/gu, 1) : example,
      })
    }
  }

  if (input.title === null || input.title.trim() === '') {
    issues.push({ kind: 'no-title', measure: 0, example: '' })
  }
  if (input.language === null || input.language.trim() === '') {
    issues.push({ kind: 'no-language', measure: 0, example: '' })
  }
  return issues
}

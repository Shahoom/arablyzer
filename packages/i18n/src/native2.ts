import type { Copy } from './copy'

/**
 * The words of the second set of Arabic-native cards (docs/design/plans/arabic-native.md §7 to
 * §14): dialect, look-alike domains, PDF forensics, the AI-training filters, search spelling sets,
 * AI visibility and the per-country Chrome UX data. Arabic is the original and awaits the owner's
 * review.
 */
export type Variety = 'msa' | 'gulf' | 'egyptian' | 'levantine' | 'maghrebi'

export interface Native2Strings {
  readonly dialect: {
    readonly title: string
    readonly varieties: Readonly<Record<Variety, string>>
    readonly headline: (variety: string) => string
    readonly tooLittle: (words: number) => string
    readonly mix: string
    readonly markers: string
    readonly headings: (variety: string) => string
    readonly fits: (country: string) => string
    readonly clashes: (country: string) => string
    readonly note: string
  }
  readonly training: {
    readonly title: string
    readonly intro: string
    readonly passes: (passed: number, total: number) => string
    readonly fails: (failed: number, total: number) => string
    readonly tooLittle: (words: number) => string
    readonly groups: Readonly<
      Record<'language' | 'gopher-repetition' | 'fineweb-quality' | 'gopher-quality' | 'c4', string>
    >
    readonly measure: string
    readonly limit: Readonly<Record<'max' | 'min', string>>
    readonly proxy: string
    readonly reference: string
    readonly passed: string
    readonly failed: string
    readonly gram: (kind: 'top' | 'dup', n: number) => string
    readonly ids: Readonly<Record<string, string>>
    readonly note: string
  }
}

export const NATIVE2: Copy<Native2Strings> = {
  reviewed: false,
  ar: {
    dialect: {
      title: 'لهجة النص',
      varieties: {
        msa: 'الفصحى',
        gulf: 'الخليجية',
        egyptian: 'المصرية',
        levantine: 'الشامية',
        maghrebi: 'المغاربية',
      },
      headline: (variety) => `نص الصفحة أقرب إلى ${variety}`,
      tooLittle: (words) => `نص عربي قليل (${String(words)} كلمة) لا يكفي لنحكم على لهجته`,
      mix: 'الكلمات المميِّزة بحسب اللهجة',
      markers: 'كلمات رأيناها',
      headings: (variety) => `العناوين أقرب إلى ${variety}`,
      fits: (country) => `تناسب لهجة النص بلدها (${country})`,
      clashes: (country) => `لا تُحكى هذه اللهجة في ${country}`,
      note: 'عيّنة كلمات مميِّزة لا نموذج لغة؛ ومعلومة لا تُخصم من درجتك.',
    },
    training: {
      title: 'هل يمر نصك من فلاتر بيانات التدريب؟',
      intro: 'فلاتر الجودة المنشورة في خط FineWeb-2 للعربية، بعتباتها.',
      passes: (passed, total) => `مرّ نصك من كل الفلاتر (${String(passed)} من ${String(total)})`,
      fails: (failed, total) => `سقط نصك في ${String(failed)} من ${String(total)} فلتراً`,
      tooLittle: (words) => `نصك ${String(words)} كلمة، وأقل من 50 كلمة لا يُحكم عليه`,
      groups: {
        language: 'اللغة (تقدير)',
        'gopher-repetition': 'تكرار Gopher',
        'fineweb-quality': 'جودة FineWeb',
        'gopher-quality': 'جودة Gopher',
        c4: 'C4 (مرجع)',
      },
      measure: 'القياس',
      limit: { max: 'حتى', min: 'من' },
      proxy: 'تقدير',
      reference: 'مرجع',
      passed: 'مرّ',
      failed: 'سقط',
      gram: (kind, n) =>
        kind === 'top'
          ? `أكثر تتابع من ${String(n)} كلمات تكراراً`
          : `مقاطع مكرَّرة من ${String(n)} كلمات`,
      ids: {
        language_score: 'نسبة الحروف العربية',
        dup_line_frac: 'الأسطر المكرَّرة',
        line_punct_ratio: 'أسطر تنتهي بعلامة ترقيم',
        char_dup_ratio: 'حروف الأسطر المكرَّرة',
        list_ratio: 'الأسطر إلى الكلمات',
        gopher_short_doc: 'عدد الكلمات (الأدنى)',
        gopher_long_doc: 'عدد الكلمات (الأقصى)',
        gopher_avg_word_length_min: 'متوسط طول الكلمة (الأدنى)',
        gopher_avg_word_length_max: 'متوسط طول الكلمة (الأقصى)',
        gopher_too_many_hashes: 'علامات #',
        gopher_too_many_ellipsis: 'علامات الحذف',
        gopher_too_many_bullets: 'أسطر بنقاط',
        gopher_too_many_end_ellipsis: 'أسطر تنتهي بحذف',
        gopher_below_alpha_threshold: 'كلمات فيها حروف',
        gopher_enough_stop_words: 'كلمات عربية شائعة',
        line_kept_ratio: 'أسطر يبقيها C4',
        too_few_sentences: 'جمل يبقيها C4',
        lorem_ipsum_or_curly_bracket: 'lorem ipsum أو قوس معقوف',
      },
      note: 'تحديد اللغة تقدير بنسبة الحروف العربية لا نموذج GlotLID، وC4 ليس في خط FineWeb-2. معلومة لا تُخصم من درجتك.',
    },
  },
  en: {
    dialect: {
      title: 'Dialect of the text',
      varieties: {
        msa: 'Modern Standard',
        gulf: 'Gulf',
        egyptian: 'Egyptian',
        levantine: 'Levantine',
        maghrebi: 'Maghrebi',
      },
      headline: (variety) => `The page's text leans ${variety}`,
      tooLittle: (words) => `Too little Arabic text (${String(words)} words) to judge its dialect`,
      mix: 'Telling words by dialect',
      markers: 'Words seen',
      headings: (variety) => `The headings lean ${variety}`,
      fits: (country) => `The dialect fits the page's country (${country})`,
      clashes: (country) => `This dialect is not the speech of ${country}`,
      note: 'A sample of telling words, not a language model; information, never deducted from your score.',
    },
    training: {
      title: 'Does your text pass the training-data filters?',
      intro:
        'The quality filters published in the FineWeb-2 pipeline for Arabic, with their thresholds.',
      passes: (passed, total) =>
        `Your text passes every filter (${String(passed)} of ${String(total)})`,
      fails: (failed, total) => `Your text fails ${String(failed)} of ${String(total)} filters`,
      tooLittle: (words) => `Your text has ${String(words)} words; under 50 is not judged`,
      groups: {
        language: 'Language (estimate)',
        'gopher-repetition': 'Gopher repetition',
        'fineweb-quality': 'FineWeb quality',
        'gopher-quality': 'Gopher quality',
        c4: 'C4 (reference)',
      },
      measure: 'Measured',
      limit: { max: 'at most', min: 'at least' },
      proxy: 'estimate',
      reference: 'reference',
      passed: 'passed',
      failed: 'failed',
      gram: (kind, n) =>
        kind === 'top'
          ? `Most repeated run of ${String(n)} words`
          : `Repeated passages of ${String(n)} words`,
      ids: {
        language_score: 'Share of Arabic letters',
        dup_line_frac: 'Repeated lines',
        line_punct_ratio: 'Lines ending in punctuation',
        char_dup_ratio: 'Characters in repeated lines',
        list_ratio: 'Lines per word',
        gopher_short_doc: 'Word count (minimum)',
        gopher_long_doc: 'Word count (maximum)',
        gopher_avg_word_length_min: 'Average word length (minimum)',
        gopher_avg_word_length_max: 'Average word length (maximum)',
        gopher_too_many_hashes: '# marks',
        gopher_too_many_ellipsis: 'Ellipses',
        gopher_too_many_bullets: 'Lines with bullets',
        gopher_too_many_end_ellipsis: 'Lines ending in an ellipsis',
        gopher_below_alpha_threshold: 'Words with letters',
        gopher_enough_stop_words: 'Common Arabic words',
        line_kept_ratio: 'Lines C4 keeps',
        too_few_sentences: 'Sentences C4 keeps',
        lorem_ipsum_or_curly_bracket: 'lorem ipsum or a curly bracket',
      },
      note: 'Language identification is an estimate from the share of Arabic letters, not the GlotLID model, and C4 is not in the FineWeb-2 pipeline. Information, never deducted from your score.',
    },
  },
}

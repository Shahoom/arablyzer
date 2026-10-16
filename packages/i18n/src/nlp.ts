import type { Copy } from './copy'

/**
 * The Arabic text tools (M7): «المدقق الإملائي العربي» and «كاشف اللهجة», on a text pasted into the page.
 * Their words, beside each tool's own copy (packages/tools). Arabic is the original and awaits the
 * owner's review.
 */
export interface NlpStrings {
  readonly common: {
    readonly textLabel: string
    readonly textPlaceholder: string
    readonly count: (used: number, max: number) => string
    readonly submit: string
    readonly working: string
    readonly off: string
    readonly privacy: string
    readonly errors: Readonly<
      Record<
        'bad-request' | 'turnstile-failed' | 'rate-limited' | 'unavailable' | 'network',
        string
      >
    >
    readonly retryAfter: (seconds: number) => string
    readonly tooShort: string
  }
  readonly spelling: {
    readonly sensitivity: string
    readonly sure: string
    readonly wide: string
    readonly summary: (found: number, words: number) => string
    readonly none: (words: number) => string
    readonly wideNote: string
    readonly truncated: string
    readonly likely: string
    readonly sureBadge: string
    readonly confidence: (percent: number) => string
    readonly alternatives: (list: string) => string
    readonly limits: string
    readonly families: Readonly<
      Record<'hamza' | 'ta-marbuta' | 'alef-maqsura' | 'tanween' | 'typo' | 'phrase', string>
    >
  }
  readonly dialect: {
    readonly headline: (variety: string) => string
    readonly mixed: string
    readonly unsure: string
    readonly tooLittle: string
    readonly varieties: Readonly<
      Record<'msa' | 'gulf' | 'egyptian' | 'levantine' | 'maghrebi', string>
    >
    readonly sentences: (read: number, words: number) => string
    readonly won: (count: number, total: number) => string
    readonly limits: string
  }
}

export const NLP_UI: Copy<NlpStrings> = {
  reviewed: false,
  ar: {
    common: {
      textLabel: 'النص العربي',
      textPlaceholder: 'الصق هنا نصاً عربياً (حتى 4000 حرف)…',
      count: (used, max) => `${String(used)} من ${String(max)} حرف`,
      submit: 'افحص النص',
      working: 'جارٍ الفحص…',
      off: 'هذه الأداة مطفأة في هذه النسخة: تعمل حيث يشغّل المشغّل خدمة تحليل العربية. يمكنك مع ذلك فحص صفحة بعنوانها من الصندوق الجانبي.',
      privacy:
        'يُرسل النص إلى خدمة تحليل العربية التابعة لنا ولا يغادر خوادمنا، ويبقى في الذاكرة ثوانيَ حتى يعود الجواب ثم يُحذف: لا نحفظه ولا نسجّله.',
      errors: {
        'bad-request': 'الصق نصاً عربياً من ثلاثة أحرف على الأقل وبحدّ أقصى 4000 حرف و60 سطراً.',
        'turnstile-failed': 'تعذّر التحقق من أنك إنسان. أعد المحاولة بعد قليل.',
        'rate-limited': 'بلغت حدّ الفحوص الآن.',
        unavailable: 'خدمة تحليل العربية لا تردّ الآن. حاول بعد قليل.',
        network: 'تعذّر الاتصال بالخدمة. تحقق من اتصالك وحاول مرة أخرى.',
      },
      retryAfter: (seconds) => `حاول بعد ${String(seconds)} ثانية.`,
      tooShort: 'النص قصير: الصق جملة كاملة على الأقل.',
    },
    spelling: {
      sensitivity: 'ما الذي نعرضه؟',
      sure: 'الأخطاء المؤكدة فقط (ثقة 90% فأكثر)',
      wide: 'ونضيف الأخطاء المحتملة (ثقة 70% فأكثر)',
      summary: (found, words) =>
        `وجدنا ${String(found)} من الكلمات الخاطئة في ${String(words)} كلمة`,
      none: (words) =>
        `لم نجد في ${String(words)} كلمة خطأ نتأكد منه. وهذا ليس تدقيقاً كاملاً: نذكر ما نتأكد منه فقط.`,
      wideNote: 'ما دون 90% اقتراحات محتملة: راجعها بنفسك.',
      truncated: 'النص طويل فقرأنا جزءه الأول.',
      likely: 'محتمل',
      sureBadge: 'مؤكد',
      confidence: (percent) => `ثقة ${String(percent)}%`,
      alternatives: (list) => `وقد يكون المقصود: ${list}`,
      limits:
        'نكشف أخطاء الهمزة والتاء المربوطة والألف المقصورة والتنوين وبعض الأخطاء المطبعية، ولا نحكم على الأسماء ولا الكلمات الأجنبية ولا اللهجات ولا ما بين « ». ما لا نتأكد منه لا نذكره.',
      families: {
        hamza: 'الهمزة',
        'ta-marbuta': 'التاء المربوطة',
        'alef-maqsura': 'الألف المقصورة',
        tanween: 'التنوين',
        typo: 'خطأ طباعي',
        phrase: 'عبارة',
      },
    },
    dialect: {
      headline: (variety) => `النص أقرب إلى ${variety}`,
      mixed: 'لا لهجة واحدة تغلب على النص: لهجاته مختلطة.',
      unsure: 'النموذج غير متأكد: ما من لهجة تبلغ 70% من احتمال الجمل.',
      tooLittle: 'النص قليل: ألصق جملاً أكثر ليقرأها النموذج.',
      varieties: {
        msa: 'الفصحى',
        gulf: 'اللهجة الخليجية',
        egyptian: 'اللهجة المصرية',
        levantine: 'اللهجة الشامية',
        maghrebi: 'اللهجة المغاربية',
      },
      sentences: (read, words) => `قرأ النموذج ${String(read)} من الجمل (${String(words)} كلمة)`,
      won: (count, total) => `فازت بـ ${String(count)} من ${String(total)} جملة`,
      limits:
        'نموذج CAMeL لتحديد اللهجة يقرأ الجمل لا الكلمات، وقد يخطئ في النصوص القصيرة أو المختلطة. المغاربية عنده تونس والرباط، والعراقية تُحسب خليجية.',
    },
  },
  en: {
    common: {
      textLabel: 'Arabic text',
      textPlaceholder: 'Paste Arabic text here (up to 4,000 characters)…',
      count: (used, max) => `${String(used)} of ${String(max)} characters`,
      submit: 'Check the text',
      working: 'Checking…',
      off: 'This tool is off in this copy: it works where the operator runs the Arabic language service. You can still check a page by its address in the box at the side.',
      privacy:
        'The text goes to our own Arabic language service and does not leave our servers. It stays in memory for the few seconds the answer takes and is then deleted: we do not store or log it.',
      errors: {
        'bad-request':
          'Paste Arabic text of at least three letters, up to 4,000 characters and 60 lines.',
        'turnstile-failed': 'We could not verify that you are human. Try again in a moment.',
        'rate-limited': 'You have reached the checks limit for now.',
        unavailable: 'The Arabic language service is not answering. Try again shortly.',
        network: 'Could not reach the service. Check your connection and try again.',
      },
      retryAfter: (seconds) => `Try again in ${String(seconds)} seconds.`,
      tooShort: 'The text is short: paste at least a whole sentence.',
    },
    spelling: {
      sensitivity: 'What to show',
      sure: 'Sure slips only (90% confidence or more)',
      wide: 'Add likely slips (70% confidence or more)',
      summary: (found, words) =>
        `${String(found)} misspelled ${found === 1 ? 'word' : 'words'} in ${String(words)} words`,
      none: (words) =>
        `No slip we are sure of in ${String(words)} words. This is not a full proofread: we name only what we are sure of.`,
      wideNote: 'Under 90% these are likely slips: check them yourself.',
      truncated: 'The text is long, so we read its first part.',
      likely: 'likely',
      sureBadge: 'sure',
      confidence: (percent) => `${String(percent)}% confidence`,
      alternatives: (list) => `It may also have meant: ${list}`,
      limits:
        'We find hamza, ta marbuta, alef maqsura and tanween slips and some typing slips, and we leave out names, foreign words, dialects and what is inside « ». What we are not sure of we do not report.',
      families: {
        hamza: 'Hamza',
        'ta-marbuta': 'Ta marbuta',
        'alef-maqsura': 'Alef maqsura',
        tanween: 'Tanween',
        typo: 'Typing slip',
        phrase: 'Phrase',
      },
    },
    dialect: {
      headline: (variety) => `The text is closer to ${variety}`,
      mixed: 'No one dialect wins: the text mixes them.',
      unsure: 'The model is not sure: no variety reaches 70% of the sentences’ probability.',
      tooLittle: 'The text is short: paste more sentences for the model to read.',
      varieties: {
        msa: 'Modern Standard',
        gulf: 'Gulf Arabic',
        egyptian: 'Egyptian Arabic',
        levantine: 'Levantine Arabic',
        maghrebi: 'Maghrebi Arabic',
      },
      sentences: (read, words) =>
        `The model read ${String(read)} sentences (${String(words)} words)`,
      won: (count, total) => `won ${String(count)} of ${String(total)} sentences`,
      limits:
        'CAMeL’s dialect model reads sentences, not words, and errs on short or mixed text. For Maghrebi it knows Tunis and Rabat, and Iraqi counts as Gulf.',
    },
  },
}

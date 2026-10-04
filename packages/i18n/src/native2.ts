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
  readonly lookalikes: {
    readonly title: string
    readonly summary: (found: number, asked: number) => string
    readonly none: (asked: number) => string
    readonly kinds: Readonly<
      Record<
        | 'tld'
        | 'arabizi'
        | 'omission'
        | 'doubling'
        | 'transposition'
        | 'neighbour'
        | 'hyphen'
        | 'confusable',
        string
      >
    >
    readonly address: string
    readonly mail: string
    readonly firstCertificate: string
    readonly noCertificate: string
    readonly fresh: string
    readonly ct: Readonly<Record<'partial' | 'unavailable', string>>
    readonly note: string
  }
  readonly crux: {
    readonly title: string
    readonly summary: (found: number, month: string) => string
    readonly none: (month: string) => string
    readonly countries: Readonly<
      Record<'SA' | 'AE' | 'EG' | 'KW' | 'QA' | 'BH' | 'OM' | 'JO' | 'MA', string>
    >
    readonly metrics: Readonly<Record<'lcp' | 'inp' | 'cls', string>>
    readonly rank: string
    readonly top: (rank: number) => string
    readonly noData: string
    readonly good: string
    readonly weak: string
    readonly billed: (megabytes: string) => string
    readonly cached: string
    readonly note: string
  }
  readonly ai: {
    readonly title: string
    readonly summary: (mentioned: number, total: number) => string
    readonly providers: Readonly<Record<'openai' | 'gemini' | 'perplexity' | 'anthropic', string>>
    readonly status: Readonly<Record<'ok' | 'refused' | 'limited' | 'failed', string>>
    readonly mentioned: string
    readonly notMentioned: string
    readonly cited: string
    readonly notCited: string
    readonly answers: (answered: number, mentioned: number, cited: number) => string
    readonly sources: string
    readonly competitors: string
    readonly questions: string
    readonly note: string
  }
  readonly suggest: {
    readonly title: string
    readonly summary: (typed: number, uncovered: number, calls: number) => string
    readonly term: string
    readonly written: string
    readonly notWritten: string
    readonly kinds: Readonly<
      Record<'ta-marbuta' | 'hamza' | 'ya' | 'arabizi' | 'drop' | 'swap', string>
    >
    readonly typed: string
    readonly notTyped: string
    readonly notAsked: string
    readonly covered: string
    readonly uncovered: string
    readonly stopped: string
    readonly note: string
  }
  readonly pdfs: {
    readonly title: string
    readonly summary: (read: number, linked: number) => string
    readonly none: string
    readonly more: (count: number) => string
    readonly outcomes: Readonly<
      Record<'robots' | 'too-large' | 'not-pdf' | 'encrypted' | 'unreadable' | 'failed', string>
    >
    readonly pages: (read: number, total: number) => string
    readonly clean: string
    readonly issues: Readonly<
      Record<
        | 'reversed'
        | 'presentation-forms'
        | 'no-unicode-map'
        | 'image-only'
        | 'no-title'
        | 'no-language',
        { readonly name: string; readonly fix: string }
      >
    >
    readonly measure: (percent: number) => string
    readonly example: string
    readonly titleLabel: string
    readonly languageLabel: string
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
    lookalikes: {
      title: 'الدومينات الشبيهة بدومينك',
      summary: (found, asked) =>
        `سجّل غيرك ${String(found)} من الدومينات الشبيهة، من ${String(asked)} اسماً سألنا عنها`,
      none: (asked) => `لم نجد دومينات شبيهة مسجَّلة بين ${String(asked)} اسماً سألنا عنها`,
      kinds: {
        tld: 'امتداد آخر',
        arabizi: 'أرابيزي',
        omission: 'حرف ناقص',
        doubling: 'حرف مكرَّر',
        transposition: 'حرفان مبدَّلان',
        neighbour: 'مفتاح مجاور',
        hyphen: 'شرطة',
        confusable: 'أحرف متشابهة',
      },
      address: 'موقع (A)',
      mail: 'بريد (MX)',
      firstCertificate: 'أول شهادة',
      noCertificate: 'لا شهادة في السجل',
      fresh: 'حديثة',
      ct: {
        partial: 'لم نسأل سجلّ الشهادات عن كل الأسماء، أو لم يردّ عن بعضها.',
        unavailable: 'لم يردّ سجلّ الشهادات (crt.sh)، فلا تواريخ شهادات هنا.',
      },
      note: 'أسماء نولّدها بقواعد ثابتة ونسأل عنها DNS عبر HTTPS؛ لا نفتح أي موقع منها، وقد يكون المسجَّل لصاحب مشروع بريء.',
    },
    crux: {
      title: 'بيانات Chrome لكل دولة',
      summary: (found, month) =>
        `لموقعك بيانات في ${String(found)} من الدول التسع (جداول ${month})`,
      none: (month) => `لا بيانات لموقعك في أي من الدول التسع (جداول ${month})`,
      countries: {
        SA: 'السعودية',
        AE: 'الإمارات',
        EG: 'مصر',
        KW: 'الكويت',
        QA: 'قطر',
        BH: 'البحرين',
        OM: 'عُمان',
        JO: 'الأردن',
        MA: 'المغرب',
      },
      metrics: { lcp: 'LCP', inp: 'INP', cls: 'CLS' },
      rank: 'ترتيب الشعبية',
      top: (rank) => `ضمن أعلى ${rank.toLocaleString('ar-EG-u-nu-latn')}`,
      noData: 'لا بيانات كافية',
      good: 'جيد',
      weak: 'دون 75٪',
      billed: (megabytes) => `حاسب BigQuery على ${megabytes} ميغابايت`,
      cached: 'من ذاكرة BigQuery بلا محاسبة',
      note: 'حصة زيارات الهاتف الجيدة: LCP حتى 2.5 ثانية، INP حتى 200 مللي ثانية، CLS حتى 0.1. معلومة لا تُخصم من درجتك.',
    },
    ai: {
      title: 'هل يذكرك الذكاء الاصطناعي؟',
      summary: (mentioned, total) =>
        `ذكرك ${String(mentioned)} من ${String(total)} مساعدين أجابوا عن أسئلة عربية في مجالك`,
      providers: {
        openai: 'OpenAI',
        gemini: 'Gemini',
        perplexity: 'Perplexity',
        anthropic: 'Claude',
      },
      status: {
        ok: 'أجاب',
        refused: 'رفض المفتاح',
        limited: 'طلب التمهّل',
        failed: 'لم يجب',
      },
      mentioned: 'ذكر علامتك',
      notMentioned: 'لم يذكر علامتك',
      cited: 'استشهد بدومينك',
      notCited: 'لم يستشهد بدومينك',
      answers: (answered, mentioned, cited) =>
        `${String(mentioned)} ذكرتك و${String(cited)} استشهدت بك، من ${String(answered)} إجابات`,
      sources: 'المصادر',
      competitors: 'دومينات استشهد بها بدلاً منك',
      questions: 'الأسئلة',
      note: 'لقطة لإجابات تتغير، ولا نحفظ نص أي إجابة. معلومة لا تُخصم من درجتك.',
    },
    suggest: {
      title: 'أخطاء البحث الشائعة في كلماتك',
      summary: (typed, uncovered, calls) =>
        `يكتب الناس ${String(typed)} من الأخطاء، ولا تكتب صفحتك ${String(uncovered)} منها (${String(calls)} طلبات إلى جوجل)`,
      term: 'الكلمة',
      written: 'تكتبها صفحتك',
      notWritten: 'لا تكتبها صفحتك',
      kinds: {
        'ta-marbuta': 'تاء مربوطة/هاء',
        hamza: 'همزة',
        ya: 'ألف مقصورة/ياء',
        arabizi: 'أرابيزي',
        drop: 'حرف محذوف',
        swap: 'حرفان مبدَّلان',
      },
      typed: 'يكتبه الناس',
      notTyped: 'لا يظهر في الاقتراحات',
      notAsked: 'لم نسأل عنه',
      covered: 'في صفحتك',
      uncovered: 'ليس في صفحتك',
      stopped: 'توقفت جوجل عن الردّ، فلم نسأل عن بعض الصيغ.',
      note: 'نعدّ الصيغة مما يكتبه الناس إن بدأ بها أحد اقتراحات جوجل التلقائية. معلومة لا تُخصم من درجتك.',
    },
    pdfs: {
      title: 'ملفات PDF في الصفحة',
      summary: (read, linked) =>
        `قرأنا ${String(read)} من ${String(linked)} ملف PDF مرتبطاً بالصفحة`,
      none: 'لا رابط إلى ملف PDF في الصفحة.',
      more: (count) => `وفيها ${String(count)} ملفات أخرى لم نفحصها (نقرأ 3 كحد أقصى).`,
      outcomes: {
        robots: 'يمنع robots.txt جلبه',
        'too-large': 'أكبر من 15 ميغابايت',
        'not-pdf': 'ليس ملف PDF',
        encrypted: 'مشفَّر بكلمة سر',
        unreadable: 'لم نستطع قراءته',
        failed: 'لم يردّ الخادم',
      },
      pages: (read, total) => `قرأنا ${String(read)} صفحة من ${String(total)}`,
      clean: 'نصه العربي يُقرأ كما يجب',
      issues: {
        reversed: {
          name: 'حروف معكوسة',
          fix: 'أعد التصدير من برنامج يدعم العربية (Word أو InDesign الشرق الأوسط) ولا تصدّر من خط يرسم الحروف مقلوبة.',
        },
        'presentation-forms': {
          name: 'أشكال عرض بدل الحروف',
          fix: 'أعد التصدير بخط OpenType/TrueType حديث مع تضمينه، فيخرج النص حروفاً أساسية.',
        },
        'no-unicode-map': {
          name: 'خط بلا خريطة Unicode',
          fix: 'ضمّن الخط في التصدير بخريطة ToUnicode (الخيارات الحديثة تفعل ذلك)، ولا تحوّل النص إلى منحنيات.',
        },
        'image-only': {
          name: 'صفحات صور بلا نص',
          fix: 'شغّل التعرف الضوئي (OCR) بالعربية، أو أعد التصدير من الملف الأصلي.',
        },
        'no-title': {
          name: 'بلا عنوان للمستند',
          fix: 'اكتب العنوان في خصائص الملف (Word: ملف ‹ معلومات ‹ العنوان).',
        },
        'no-language': {
          name: 'بلا لغة للمستند',
          fix: 'عيّن لغة النص «العربية» وفعّل «Create Tagged PDF» عند التصدير.',
        },
      },
      measure: (percent) => `${String(percent)}٪`,
      example: 'مثال',
      titleLabel: 'العنوان',
      languageLabel: 'اللغة',
      note: 'تقدير من نص تقرؤه مكتبة pdf.js من أول 20 صفحة، لا يحفظ الملف.',
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
    lookalikes: {
      title: 'Look-alikes of your domain',
      summary: (found, asked) =>
        `Someone has registered ${String(found)} look-alike domains, of the ${String(asked)} names we asked about`,
      none: (asked) =>
        `We found no registered look-alike among the ${String(asked)} names we asked about`,
      kinds: {
        tld: 'another suffix',
        arabizi: 'Arabizi',
        omission: 'a letter left out',
        doubling: 'a letter doubled',
        transposition: 'two letters swapped',
        neighbour: 'a neighbouring key',
        hyphen: 'a hyphen',
        confusable: 'confusable letters',
      },
      address: 'site (A)',
      mail: 'mail (MX)',
      firstCertificate: 'First certificate',
      noCertificate: 'no certificate in the log',
      fresh: 'recent',
      ct: {
        partial:
          'We did not ask the certificate log about every name, or it did not answer for some.',
        unavailable:
          'The certificate log (crt.sh) did not answer, so there are no certificate dates here.',
      },
      note: 'Names we make by fixed rules and ask DNS over HTTPS about; we open none of these sites, and a registered name may belong to an innocent business.',
    },
    crux: {
      title: 'Chrome data by country',
      summary: (found, month) =>
        `Your site has data in ${String(found)} of the nine countries (tables ${month})`,
      none: (month) => `Your site has no data in any of the nine countries (tables ${month})`,
      countries: {
        SA: 'Saudi Arabia',
        AE: 'the UAE',
        EG: 'Egypt',
        KW: 'Kuwait',
        QA: 'Qatar',
        BH: 'Bahrain',
        OM: 'Oman',
        JO: 'Jordan',
        MA: 'Morocco',
      },
      metrics: { lcp: 'LCP', inp: 'INP', cls: 'CLS' },
      rank: 'Popularity rank',
      top: (rank) => `in the top ${rank.toLocaleString('en-US')}`,
      noData: 'not enough data',
      good: 'good',
      weak: 'under 75%',
      billed: (megabytes) => `BigQuery billed ${megabytes} MB`,
      cached: 'from BigQuery’s cache, not billed',
      note: 'The share of good phone visits: LCP up to 2.5 s, INP up to 200 ms, CLS up to 0.1. Information, never deducted from your score.',
    },
    ai: {
      title: 'Does AI mention you?',
      summary: (mentioned, total) =>
        `${String(mentioned)} of the ${String(total)} assistants that answered Arabic questions in your field mentioned you`,
      providers: {
        openai: 'OpenAI',
        gemini: 'Gemini',
        perplexity: 'Perplexity',
        anthropic: 'Claude',
      },
      status: {
        ok: 'answered',
        refused: 'refused the key',
        limited: 'asked us to slow down',
        failed: 'did not answer',
      },
      mentioned: 'mentioned your brand',
      notMentioned: 'did not mention your brand',
      cited: 'cited your domain',
      notCited: 'did not cite your domain',
      answers: (answered, mentioned, cited) =>
        `${String(mentioned)} mentioned you and ${String(cited)} cited you, of ${String(answered)} answers`,
      sources: 'Sources',
      competitors: 'Domains cited instead of you',
      questions: 'Questions',
      note: 'A snapshot of answers that change; no answer text is kept. Information, never deducted from your score.',
    },
    suggest: {
      title: 'Common search misspellings of your words',
      summary: (typed, uncovered, calls) =>
        `People type ${String(typed)} of the misspellings, and your page does not write ${String(uncovered)} of them (${String(calls)} requests to Google)`,
      term: 'Word',
      written: 'your page writes it',
      notWritten: 'your page does not write it',
      kinds: {
        'ta-marbuta': 'ta marbuta / ha',
        hamza: 'hamza',
        ya: 'alef maqsura / ya',
        arabizi: 'Arabizi',
        drop: 'a letter dropped',
        swap: 'two letters swapped',
      },
      typed: 'people type it',
      notTyped: 'not in the suggestions',
      notAsked: 'not asked about',
      covered: 'on your page',
      uncovered: 'not on your page',
      stopped: 'Google stopped answering, so some forms were not asked about.',
      note: 'A form counts as typed when one of Google’s autocomplete suggestions begins with it. Information, never deducted from your score.',
    },
    pdfs: {
      title: 'PDFs on the page',
      summary: (read, linked) =>
        `We read ${String(read)} of the ${String(linked)} PDFs the page links`,
      none: 'The page links to no PDF.',
      more: (count) => `It has ${String(count)} more we did not check (we read 3 at most).`,
      outcomes: {
        robots: 'robots.txt keeps us from fetching it',
        'too-large': 'over 15 MB',
        'not-pdf': 'not a PDF file',
        encrypted: 'encrypted with a password',
        unreadable: 'we could not read it',
        failed: 'the server did not answer',
      },
      pages: (read, total) => `We read ${String(read)} of ${String(total)} pages`,
      clean: 'its Arabic text reads as it should',
      issues: {
        reversed: {
          name: 'Reversed letters',
          fix: 'Export again from a program that supports Arabic (Word, or the Middle Eastern edition of InDesign), and not from a font that draws the letters backwards.',
        },
        'presentation-forms': {
          name: 'Presentation forms instead of letters',
          fix: 'Export again with a modern OpenType or TrueType font, embedded, so the text comes out as base letters.',
        },
        'no-unicode-map': {
          name: 'A font with no Unicode map',
          fix: 'Embed the font on export with a ToUnicode map (modern options do) and do not convert text to outlines.',
        },
        'image-only': {
          name: 'Picture pages with no text',
          fix: 'Run Arabic OCR, or export again from the original file.',
        },
        'no-title': {
          name: 'No document title',
          fix: 'Write the title in the file’s properties (Word: File › Info › Title).',
        },
        'no-language': {
          name: 'No document language',
          fix: 'Set the text’s language to Arabic and turn on «Create Tagged PDF» when exporting.',
        },
      },
      measure: (percent) => `${String(percent)}%`,
      example: 'Example',
      titleLabel: 'Title',
      languageLabel: 'Language',
      note: 'An estimate from the text pdf.js reads from the first 20 pages; the file is not kept.',
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

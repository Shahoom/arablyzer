import type { Copy } from './copy'

/**
 * The words of the Arabic-native features' cards (docs/design/plans/arabic-native.md): the font
 * slimmer's downloads, the spelling search test, the country fit and the Arabic X-ray. Arabic is
 * the original and awaits the owner's review.
 */
export interface NativeStrings {
  readonly fonts: {
    readonly title: string
    readonly intro: string
    readonly file: string
    readonly now: string
    readonly subset: string
    readonly saves: (kb: string, percent: number) => string
    readonly download: string
    readonly downloadHint: string
    readonly snippet: string
    readonly unused: string
    readonly failed: string
    readonly limited: string
    readonly none: string
    readonly pending: string
  }
  readonly country: {
    readonly title: string
    readonly names: Readonly<
      Record<'SA' | 'AE' | 'EG' | 'KW' | 'QA' | 'BH' | 'OM' | 'JO' | 'MA', string>
    >
    readonly ready: (percent: number, country: string) => string
    readonly thin: (country: string) => string
    readonly unclear: string
    readonly none: string
    readonly judged: (judged: number) => string
    readonly evidence: string
    readonly signal: Readonly<Record<'domain' | 'lang' | 'hreflang' | 'currency' | 'phone', string>>
    readonly items: Readonly<
      Record<'currency' | 'phone' | 'digits' | 'vat' | 'hijri' | 'lang', string>
    >
    readonly status: Readonly<Record<'ok' | 'gap' | 'unknown', string>>
    readonly note: string
  }
  readonly search: {
    readonly title: string
    readonly summary: (lost: number, total: number) => string
    readonly clean: (total: number) => string
    readonly via: Readonly<Record<'form' | 'wordpress' | 'platform', string>>
    readonly requests: (count: number) => string
    readonly word: string
    readonly asked: string
    readonly found: (count: number) => string
    readonly kinds: Readonly<
      Record<'ta-marbuta' | 'alef' | 'ya' | 'tatweel' | 'diacritics' | 'digits' | 'arabizi', string>
    >
    readonly outcomes: Readonly<Record<'same' | 'differs' | 'lost' | 'unanswered', string>>
    readonly notCounted: string
    readonly floor: string
  }
  readonly xray: {
    readonly title: string
    readonly intro: string
    readonly integrity: (percent: number) => string
    readonly clean: string
    readonly engineLine: (broken: number, total: number) => string
    readonly imageAlt: (engine: string) => string
    readonly noImage: string
    readonly words: string
    readonly kinds: Readonly<Record<'glyph' | 'replacement', string>>
    readonly elsewhere: (count: number) => string
    readonly truncated: string
    readonly note: string
  }
}

export const NATIVE: Copy<NativeStrings> = {
  reviewed: false,
  ar: {
    fonts: {
      title: 'الخطوط العربية في الصفحة',
      intro:
        'لكل خط ويب عربي حمّلته الصفحة: حجم ملفه، وحجم نسخة مخفّفة بالحروف التي يعرضها نص الصفحة. تُصنع النسخة حين تضغط التنزيل، ولا نحتفظ بها.',
      file: 'الملف',
      now: 'حجمه الآن',
      subset: 'نسخة مخفّفة',
      saves: (kb, percent) => `توفّر ${kb} (${percent}٪)`,
      download: 'نزّل النسخة (WOFF2)',
      downloadHint: 'تُصنع من ملف الخط على موقعك وتُرسل إليك دون تخزين.',
      snippet: 'قاعدة @font-face الجاهزة',
      unused: 'لا نص عربي في الصفحة يستخدم هذا الخط، فلا نسخة له.',
      failed: 'تعذّر صنع النسخة الآن. حاول بعد قليل.',
      limited: 'طلبت نسخًا كثيرة في وقت قصير. انتظر قليلًا.',
      none: 'لم تحمّل الصفحة خطوط ويب عربية نقرؤها.',
      pending: 'نصنع النسخة…',
    },
    country: {
      title: 'ملاءمة الصفحة لبلدها',
      names: {
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
      ready: (percent, country) => `جاهزة بنسبة ${String(percent)}٪ لـ${country}`,
      thin: (country) =>
        `تبدو الصفحة لـ${country}، لكن دليلًا واحدًا لا يكفي لنقول ذلك ولا لحساب نسبة`,
      unclear: 'الأدلة متعارضة أو متقاربة بين بلدان، فلا نسمّي بلدًا ولا نحسب نسبة',
      none: 'لا في الصفحة ما يدل على بلد بعينه، فلا نخمّن',
      judged: (judged) => `حكمنا على ${String(judged)} من البنود`,
      evidence: 'ما دلّنا',
      signal: {
        domain: 'نطاق البلد',
        lang: 'إقليم وسم اللغة',
        hreflang: 'hreflang',
        currency: 'العملة',
        phone: 'رمز الاتصال',
      },
      items: {
        currency: 'عملة الأسعار',
        phone: 'أرقام الهاتف برمز الدولة',
        digits: 'الأرقام',
        vat: 'بيان الضريبة',
        hijri: 'التاريخ الهجري',
        lang: 'إقليم وسم اللغة',
      },
      status: { ok: 'مناسب', gap: 'ينقص', unknown: 'لا ما نحكم به' },
      note: 'معلومة لا تُخصم من درجتك.',
    },
    search: {
      title: 'ما فعله بحث موقعك',
      summary: (lost, total) => `بحثكم يضيّع ${String(lost)} من ${String(total)} تنويعًا إملائيًا`,
      clean: (total) => `بحثكم وجد كل ${String(total)} من التنويعات التي جرّبناها`,
      via: {
        form: 'وجدنا البحث في نموذج الصفحة',
        wordpress: 'لم نجد نموذجًا، فسألنا عنوان بحث ووردبريس (?s=)',
        platform: 'لم نجد نموذجًا، فسألنا عنوان بحث المنصة المعروف',
      },
      requests: (count) => `${String(count)} طلبًا، شاملةً طلبًا واحدًا لاستعلام لا معنى له`,
      word: 'الكلمة',
      asked: 'ما سألنا عنه',
      found: (count) => `${String(count)} نتيجة`,
      kinds: {
        'ta-marbuta': 'ة ↔ ه',
        alef: 'همزة الألف',
        ya: 'ى ↔ ي',
        tatweel: 'تطويل',
        diacritics: 'تشكيل',
        digits: 'أرقام الكتابة الأخرى',
        arabizi: 'عربيزي (لا يُحسب)',
      },
      outcomes: {
        same: 'كالأصل',
        differs: 'مختلف قليلًا',
        lost: 'ضاع',
        unanswered: 'بلا جواب',
      },
      notCounted: 'يُعرض ولا يدخل في العدّ',
      floor: 'عدد النتائج هو ما تعرضه الصفحة الأولى من الجواب، فهو حدٌّ أدنى.',
    },
    xray: {
      title: 'أشعة الحرف العربي',
      intro:
        'الشاشة الأولى كما رسمها كل متصفح، وحول كل كلمة عربية رُسمت خطأً دائرة: حرف لا يرسمه أي خط في قائمة خطوط الكلمة، أو حرف استبدال (�).',
      integrity: (percent) => `سلامة العربية ${String(percent)}٪`,
      clean: 'رُسمت كل الكلمات العربية سليمة في المتصفحات الثلاثة، بحسب خطوط الصفحة التي قرأناها.',
      engineLine: (broken, total) =>
        broken === 0
          ? `كل الكلمات سليمة (${String(total)})`
          : `${String(broken)} من ${String(total)} كلمة رُسمت خطأً`,
      imageAlt: (engine) => `الشاشة الأولى في ${engine} وحول الكلمات الخاطئة دوائر`,
      noImage: 'صورة الشاشة كبيرة فلم نحتفظ بها، وهذه الكلمات الخاطئة فيها.',
      words: 'كلمات الشاشة الأولى',
      kinds: { glyph: 'حرف بلا رسم', replacement: 'حرف استبدال' },
      elsewhere: (count) => `${String(count)} كلمة خاطئة أخرى أسفل الشاشة الأولى`,
      truncated: 'الصفحة أطول مما نعدّ، فالنسبة تقريبية.',
      note: 'نحكم بخطوط الويب التي حمّلتها الصفحة وبأحرف الاستبدال؛ لا نعرف ما ترسمه خطوط جهاز الزائر. معلومة لا تُخصم من درجتك.',
    },
  },
  en: {
    fonts: {
      title: "The page's Arabic fonts",
      intro:
        'For each Arabic web font the page loaded: the size of its file, and of a subset holding only the letters its text shows. The subset is made when you press download, and we do not keep it.',
      file: 'File',
      now: 'Size now',
      subset: 'Subset',
      saves: (kb, percent) => `saves ${kb} (${percent}%)`,
      download: 'Download the subset (WOFF2)',
      downloadHint: 'Made from the font file on your site and sent to you, not stored.',
      snippet: 'The @font-face rule, ready',
      unused: 'No Arabic text on the page uses this font, so it has no subset.',
      failed: 'The subset could not be made now. Try again shortly.',
      limited: 'You asked for many subsets in a short time. Wait a little.',
      none: 'The page loaded no Arabic web fonts we can read.',
      pending: 'Making the subset…',
    },
    country: {
      title: 'How ready the page is for its country',
      names: {
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
      ready: (percent, country) => `Ready ${String(percent)}% for ${country}`,
      thin: (country) =>
        `The page looks written for ${country}, but one kind of evidence is not enough to say so or to work out a percentage`,
      unclear:
        'The evidence conflicts or is close between countries, so we name none and give no percentage',
      none: 'Nothing on the page points to one country, and we do not guess',
      judged: (judged) => `${String(judged)} items judged`,
      evidence: 'What told us',
      signal: {
        domain: 'Country domain',
        lang: 'Language tag region',
        hreflang: 'hreflang',
        currency: 'Currency',
        phone: 'Calling code',
      },
      items: {
        currency: 'Currency of the prices',
        phone: 'Phone numbers with the country code',
        digits: 'Digits',
        vat: 'VAT statement',
        hijri: 'Hijri date',
        lang: 'Language tag region',
      },
      status: { ok: 'fits', gap: 'missing', unknown: 'nothing to judge by' },
      note: 'Information, never deducted from your score.',
    },
    search: {
      title: 'What your site search did',
      summary: (lost, total) =>
        `Your search loses ${String(lost)} of ${String(total)} spelling variants`,
      clean: (total) => `Your search found all ${String(total)} variants we tried`,
      via: {
        form: 'We found the search in a form on the page',
        wordpress: 'No form found, so we asked WordPress’s search address (?s=)',
        platform: 'No form found, so we asked the platform’s known search address',
      },
      requests: (count) => `${String(count)} requests, one of them a query that means nothing`,
      word: 'Word',
      asked: 'Asked',
      found: (count) => `${String(count)} ${count === 1 ? 'result' : 'results'}`,
      kinds: {
        'ta-marbuta': 'ة ↔ ه',
        alef: 'Alef’s hamza',
        ya: 'ى ↔ ي',
        tatweel: 'Tatweel',
        diacritics: 'Diacritic',
        digits: 'Other script’s digits',
        arabizi: 'Arabizi (not counted)',
      },
      outcomes: {
        same: 'as the word',
        differs: 'slightly different',
        lost: 'lost',
        unanswered: 'no answer',
      },
      notCounted: 'Shown, not counted',
      floor: 'The number of results is what the first page of the answer shows, so it is a floor.',
    },
    xray: {
      title: 'Arabic X-ray',
      intro:
        'The first screen as each browser drew it, with a circle round every Arabic word drawn wrongly: a letter no font in the word’s font list draws, or a replacement character (�).',
      integrity: (percent) => `Arabic integrity ${String(percent)}%`,
      clean:
        'Every Arabic word was drawn correctly in all the browsers, going by the page’s fonts we could read.',
      engineLine: (broken, total) =>
        broken === 0
          ? `All ${String(total)} words are drawn correctly`
          : `${String(broken)} of ${String(total)} words drawn wrongly`,
      imageAlt: (engine) => `The first screen in ${engine}, with circles round the wrong words`,
      noImage: 'The picture was too big to keep, but these are the wrong words in it.',
      words: 'Words in the first screen',
      kinds: { glyph: 'Letter with no glyph', replacement: 'Replacement character' },
      elsewhere: (count) =>
        `${String(count)} more wrong ${count === 1 ? 'word' : 'words'} below the first screen`,
      truncated: 'The page is longer than we count, so the percentage is approximate.',
      note: 'We judge by the web fonts the page loaded and by replacement characters; we cannot know what a visitor’s own fonts draw. Information, never deducted from your score.',
    },
  },
}

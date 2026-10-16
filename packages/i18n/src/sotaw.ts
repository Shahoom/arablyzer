import type { Copy } from './copy'

/**
 * «حالة الويب العربي» / State of the Arabic Web (M9, docs/design/plans/m9-state-of-arabic-web.md):
 * the report's page, the explorer and the links to them. Every number on the page comes from an
 * edition's data or from the crawl's own settings, never from this copy: a `{name}` here is filled in
 * by the page (apps/web/src/lib/sotaw.ts), and `code` in backticks is set in code type.
 * The metrics are the ids of `packages/sotaw/src/metrics.ts`; a test checks that each has words.
 */
export interface SotawMetricStrings {
  /** What the share counts: «صفحات عربية تفكّك حروفها». */
  readonly title: string
  /** One sentence on how it is judged. */
  readonly hint: string
}

export interface SotawSection {
  readonly id: string
  readonly title: string
  readonly paragraphs?: readonly string[]
  readonly items?: readonly string[]
  /** A paragraph after the list. */
  readonly after?: readonly string[]
}

export interface SotawStrings {
  readonly meta: { readonly title: string; readonly description: string }
  readonly breadcrumb: string
  readonly title: string
  readonly lead: string
  readonly contents: string
  readonly related: string
  /** What the page says until an edition has numbers. */
  readonly soon: {
    readonly kick: string
    readonly title: string
    readonly lead: string
    readonly items: readonly string[]
    /** `{sites}` sites, `{countries}` countries, `{list}` the Tranco list's id, `{date}` its date. */
    readonly frame: string
    readonly frameNoDate: string
  }
  /** `{edition}`, `{reached}`, `{frame}`, `{date}`, `{engines}`. */
  readonly edition: {
    readonly label: string
    readonly reached: string
    readonly finished: string
    readonly partial: string
    readonly engines: string
  }
  readonly findings: {
    readonly title: string
    readonly lead: string
    /** `{n}` pages judged. */
    readonly judged: string
    /** `{lo}` and `{hi}`, percentages. */
    readonly interval: string
  }
  readonly countries: {
    readonly title: string
    readonly lead: string
    readonly table: string
    readonly columns: {
      readonly country: string
      readonly sites: string
      readonly share: string
      readonly interval: string
    }
    /** `{min}` sites. */
    readonly hidden: string
    readonly whole: string
    /** The chart's alternative text: `{metric}`, `{country}`, `{share}`, `{lo}`, `{hi}`. */
    readonly bar: string
  }
  readonly platforms: {
    readonly title: string
    readonly lead: string
    readonly none: string
    readonly other: string
    readonly share: string
  }
  readonly funnel: {
    readonly title: string
    readonly lead: string
    readonly frame: string
    readonly reached: string
    readonly skipped: string
    readonly failed: string
    readonly pending: string
    readonly reasons: Readonly<Record<string, string>>
  }
  readonly explorer: {
    readonly title: string
    readonly lead: string
    readonly country: string
    readonly platform: string
    readonly metric: string
    readonly allCountries: string
    readonly allPlatforms: string
    readonly loading: string
    readonly failed: string
    readonly noScript: string
    /** `{min}` sites. */
    readonly tooFew: string
    /** `{n}` pages judged. */
    readonly judged: string
    readonly weighted: string
    readonly pooled: string
  }
  readonly frame: {
    readonly title: string
    readonly lead: string
    readonly caption: string
    readonly country: string
    readonly sites: string
    readonly total: string
  }
  readonly method: {
    readonly title: string
    readonly sections: readonly SotawSection[]
  }
  readonly data: {
    readonly title: string
    readonly lead: string
    readonly license: string
    readonly licenseLink: string
    readonly download: string
    readonly files: Readonly<Record<string, string>>
    readonly frameFile: string
    readonly cite: string
    readonly citeLead: string
  }
  /** The knowledge hub's and the footer's links to the report. */
  readonly hub: { readonly title: string; readonly lead: string; readonly cta: string }
  readonly metrics: Readonly<Record<string, SotawMetricStrings>>
  readonly groups: Readonly<Record<string, string>>
  /** A category's name in a chart; the numbered ones (the score's tens, the headers' count) are drawn by the page. */
  readonly categories: Readonly<Record<string, string>>
}

/** The address the owner reads (a decision still open: docs/design/plans/m9-state-of-arabic-web.md §7). */
export const OPT_OUT_EMAIL = 'optout@arablyzer.com'

export const SOTAW_UI: Copy<SotawStrings> = {
  reviewed: false,
  ar: {
    meta: {
      title: 'حالة الويب العربي: تقرير Arablyzer السنوي',
      description:
        'تقرير سنوي ببيانات مفتوحة عن الصفحات الرئيسية لأشهر المواقع على نطاقات الدول العربية: العرض العربي، واتجاه RTL، والجوال، والسرعة، والأمان، بمنهجية منشورة.',
    },
    breadcrumb: 'حالة الويب العربي',
    title: 'حالة الويب العربي',
    lead: 'كيف تبدو الصفحات الرئيسية لأشهر المواقع على نطاقات الدول العربية حين تُفحص كلها بالقواعد نفسها؟ أرقام حقيقية بحدود ثقة، ومنهجية منشورة قبل الزحف، وبيانات مفتوحة.',
    contents: 'محتويات الصفحة',
    related: 'صفحات قريبة',
    soon: {
      kick: 'قريباً',
      title: 'الإصدار الأول قريباً',
      lead: 'لم يكتمل الزحف بعد، ولن نعرض رقماً قبل أن يكتمل: كل ما ستراه هنا سيأتي من فحص حقيقي لكل موقع في العيّنة. حتى ذلك الحين، العيّنة والمنهجية منشورتان كي يراجعهما أي أحد.',
      items: [
        'الأرقام الرئيسية، لكل منها حدود ثقته وعدد الصفحات التي حُكم عليها.',
        'مقارنة بين الدول العربية، ونسب المنصّات (سلّة وزد ووردبريس وشوبيفاي وغيرها).',
        'مستكشف بيانات تختار فيه الدولة والمنصّة والمقياس.',
        'ملفات البيانات: Parquet وCSV وJSON مع JSON Schema، بترخيص CC BY 4.0.',
      ],
      frame:
        'العيّنة منشورة قبل الزحف: {sites} موقعاً من قائمة Tranco ({list}، بتاريخ {date}) على {countries} نطاقاً وطنياً.',
      frameNoDate:
        'العيّنة منشورة قبل الزحف: {sites} موقعاً من قائمة Tranco ({list}) على {countries} نطاقاً وطنياً.',
    },
    edition: {
      label: 'إصدار {edition}',
      reached: 'فُحصت {reached} صفحة رئيسية من أصل {frame} موقعاً في العيّنة',
      finished: 'انتهى الزحف في {date}',
      partial: 'لم يكتمل الزحف بعد، والأرقام لجزء عشوائي من العيّنة.',
      engines: 'المتصفحات: {engines}',
    },
    findings: {
      title: 'أهم النتائج',
      lead: 'كل نسبة هي حصة الصفحات الرئيسية التي حُكم عليها في هذا المقياس، موزونة بحجم قائمة كل دولة. الخط تحت الرقم هو حدود الثقة 95%.',
      judged: 'من {n} صفحة حُكم عليها',
      interval: 'من {lo} إلى {hi}',
    },
    countries: {
      title: 'الدول',
      lead: 'نسبة الصفحات في كل دولة. القضيب هو النسبة، والخط حوله هو حدود الثقة 95%.',
      table: 'عرض الأرقام في جدول',
      columns: {
        country: 'الدولة',
        sites: 'صفحات حُكم عليها',
        share: 'النسبة',
        interval: 'حدود الثقة 95%',
      },
      hidden: 'لا نعرض دولة فيها أقل من {min} صفحة حُكم عليها، حتى لا يشير الرقم إلى مواقع قليلة.',
      whole: 'كل العيّنة',
      bar: '{country}: {share} (من {lo} إلى {hi})',
    },
    platforms: {
      title: 'المنصّات',
      lead: 'على أي منصّة تعمل الصفحة، كما تكشفها قاعدة كشف المنصّة. نسمّي منصّة حين تشترك فيها صفحات كافية.',
      none: 'منصّة غير معروفة',
      other: 'منصّات أخرى',
      share: 'من الصفحات',
    },
    funnel: {
      title: 'ماذا حدث لمواقع العيّنة',
      lead: 'ليست كل مواقع القائمة في الأرقام. نعرض ما حدث لكل موقع، لأن من لم نصل إليه لا تغطيه حدود الثقة.',
      frame: 'مواقع العيّنة',
      reached: 'صفحات فُحصت وحُكم عليها',
      skipped: 'مواقع لم نفحصها',
      failed: 'فحوص فشلت',
      pending: 'ما زال ينتظر',
      reasons: {
        robots: 'robots.txt يمنع الزاحف',
        'robots-unreachable': 'تعذّرت قراءة robots.txt',
        'bot-challenge': 'اختبار حماية من الروبوتات',
        'http-error': 'ردّ الموقع بخطأ',
        unreachable: 'لم يفتح الموقع',
        'not-html': 'الصفحة ليست HTML',
        'off-domain': 'الصفحة الرئيسية تحوّلت لنطاق آخر',
        'opt-out': 'صاحب الموقع طلب الاستثناء',
        'no-page': 'لم نجد صفحة نحكم عليها',
        other: 'سبب آخر',
      },
    },
    explorer: {
      title: 'مستكشف البيانات',
      lead: 'اختر دولة ومنصّة ومقياساً لترى التوزيع. تحمّل الصفحة ملف الأرقام عند أول استخدام.',
      country: 'الدولة',
      platform: 'المنصّة',
      metric: 'المقياس',
      allCountries: 'كل الدول',
      allPlatforms: 'كل المنصّات',
      loading: 'نحمّل الأرقام…',
      failed: 'تعذّر تحميل الأرقام. حمّل الملفات من قسم البيانات.',
      noScript: 'المستكشف يحتاج JavaScript. الأرقام نفسها في الجداول أعلاه وفي ملفات البيانات.',
      tooFew: 'في هذا الاختيار أقل من {min} صفحة حُكم عليها، فلا نعرض رقماً.',
      judged: 'من {n} صفحة حُكم عليها',
      weighted: 'كل العيّنة، موزونة بحجم قائمة كل دولة',
      pooled: 'نسبة الصفحات في الاختيار، بلا ترجيح',
    },
    frame: {
      title: 'عيّنة المواقع',
      lead: 'المواقع هي ما في قائمة Tranco لأشهر مليون نطاق على نطاقات الدول العربية. العيّنة منشورة قبل الزحف، ومن يريد يراجعها.',
      caption: 'مواقع العيّنة في كل دولة',
      country: 'الدولة',
      sites: 'المواقع',
      total: 'المجموع',
    },
    method: {
      title: 'المنهجية',
      sections: [
        {
          id: 'measured',
          title: 'ماذا نقيس',
          paragraphs: [
            'نفحص الصفحة الرئيسية فقط لكل موقع، بقواعد Arablyzer نفسها التي يفحص بها أي زائر موقعه: الكود حتمي، وللصفحة نفسها النتيجة نفسها. كل رقم هو حصة الصفحات التي حُكم عليها في المقياس. صفحة لا تنطبق عليها القاعدة (فحص الاتجاه لصفحة غير عربية مثلاً) لا تدخل في مقام ذلك الرقم.',
          ],
          items: [
            'العرض العربي: تباعد الحروف الذي يقطع اتصالها، ومشكلات الخط العربي، وخلط الأرقام، ورمز الريال السعودي الجديد.',
            'الاتجاه واللغة: `dir="rtl"` و`lang` في الصفحات العربية.',
            'قراءة الآلة: كلمات ممطوطة بالتطويل أو فيها محارف خفية، ونص لا يصل في HTML قبل السكربتات، ومنع زواحف بحث الذكاء الاصطناعي في robots.txt.',
            'الجوال: صفحة RTL أعرض من شاشة الهاتف، وغياب وسم viewport.',
            'السرعة: Core Web Vitals من تقرير Chrome UX (بيانات مستخدمين حقيقيين على الهاتف) حين يملك الموقع بيانات. لا نعرض أرقام مختبر لأنها تتغير من مرة لأخرى.',
            'الأمان: HTTPS وخمس ترويسات: HSTS وCSP وnosniff وحماية الإطارات وسياسة المُحيل.',
            'البنية: استخدام JSON-LD وصحة صياغته، والمنصّة، ودرجة Arablyzer.',
          ],
          after: [
            'قياس «تفكّك الحروف» يعني بالتحديد `letter-spacing` على نص عربي، وهو السبب الوحيد الذي نكشفه بيقين في متصفح واحد. مشكلات التشكيل داخل الخط نفسه لا نقيسها هنا.',
          ],
        },
        {
          id: 'frame',
          title: 'العيّنة',
          paragraphs: [
            'نأخذ من قائمة Tranco (رقم قائمة ثابت نسجّله) كل نطاق ينتهي بنطاق دولة عربية: `.sa` `.ae` `.eg` `.kw` `.qa` `.bh` `.om` `.jo` `.ma` `.dz` `.tn` `.iq` `.lb` `.ly` `.sy` `.ye` `.sd` `.ps` `.mr`.',
            'إذا زادت المواقع عن {cap} موقع نأخذ لكل دولة حدّاً أدنى ثم نقسم الباقي بحسب ما بقي لكل دولة، ونختار داخل الدولة بدالة تجزئة مع بذرة منشورة، فالاختيار عشوائي بالنسبة للترتيب ويتكرر بالنتيجة نفسها على أي جهاز. الأرقام الحقيقية للقائمة في قسم «عيّنة المواقع» أعلاه.',
            'ملف العيّنة CSV فيه النطاق والترتيب والدولة وليس فيه غير ذلك، وهو في مستودع المشروع.',
          ],
        },
        {
          id: 'crawl',
          title: 'كيف نزحف',
          items: [
            'الصفحة الرئيسية فقط (`https://` ثم `http://` ثم `www`). لا نتبع رابطاً ولا نرسل نموذجاً ولا نتجاوز اختبار حماية.',
            'نقرأ robots.txt كما يفعل الزاحف: مجموعة `*` تُحسب، ومنع `ArablyzerBot` يُحترم، وملف لا نستطيع قراءته يُبعدنا. الموقع الذي يمنعنا لا نفحصه.',
            'نعرّف بأنفسنا في كل طلب بوكيل المستخدم `ArablyzerBot` وبصفحة تشرح كيف تمنعه.',
            'الأولوية للزوار دائماً: فحص الزاحف في آخر الطابور، ولا نبدأ فحصاً ما دام فحص زائر ينتظر أو يعمل أو الخادم مشغول، وبمعدل لا يزيد عن فحص كل {interval} ثانية، فحصاً واحداً في المرة.',
            'متصفح Chromium وحده في الأصل. لا نحفظ لقطات شاشة ولا نصوص صفحات: نحفظ لكل موقع حرفاً لنتيجة كل قاعدة وبضع حقائق (لغة الصفحة واتجاهها والمنصّة وأرقام CrUX والدرجة)، ونحذف الفحص بتقريره فور ذلك.',
          ],
        },
        {
          id: 'stats',
          title: 'كيف نحسب',
          items: [
            'لكل نسبة حدود ثقة 95% بطريقة Wilson.',
            'نسبة «كل العيّنة» موزونة بحجم قائمة كل دولة، لا بعدد صفحاتها التي وصلنا إليها، فلا تطغى دولة صغيرة أُخذ منها حدّ أدنى. حدودها بحجم عيّنة فعّال يحسبه تباين الترجيح.',
            'نسبة دولة أو منصّة هي نسبة صفحاتها بلا ترجيح.',
            'لا نعرض خلية فيها أقل من {min} صفحة حُكم عليها.',
          ],
          after: [
            'حدود الثقة تقيس تذبذب العيّنة فقط. لا تغطي المواقع التي لم نصل إليها (محظورة أو معطلة أو خلف حماية) ولا قاعدة تخطئ في صفحة. لذلك ننشر ما حدث لكل موقع في العيّنة.',
          ],
        },
        {
          id: 'limits',
          title: 'حدود هذا التقرير',
          items: [
            'نطاق الدولة ليس جمهورها: بعض النطاقات تُستخدم عالمياً (`.ly` لروابط الاختصار مثلاً)، وبعض المواقع فرع محلي لشركة عالمية.',
            'لا نغطي المواقع العربية على `.com` و`.net` وأخواتها، ولا النطاقات المعرّبة، ولا المواقع خارج أشهر مليون نطاق. قد يضيف إصدار لاحق مصدراً ثانياً.',
            'صفحة رئيسية واحدة لكل موقع: لا تمثّل بقية الصفحات ولا ما خلف تسجيل الدخول.',
            'نتيجة قاعدة واحدة ليست حكماً على جودة الموقع.',
            'مقاييس CrUX تحتاج مفتاحاً وبيانات كافية للموقع، فلبعض المواقع لا رقم.',
          ],
        },
        {
          id: 'ethics',
          title: 'الأخلاقيات وطلب الاستثناء',
          items: [
            'لا ننشر اسم موقع ولا ترتيبه ولا نتيجته. الأرقام مجاميع، وصفوف المواقع في ملف البيانات بلا نطاق: معرّف مشفّر بمفتاح سرّي لا ينشر، ولا يمكن حسابه من قائمة العيّنة.',
            'من لا يريد أن يُفحص موقعه يضيف إلى robots.txt `User-agent: ArablyzerBot` ثم `Disallow: /`، أو يراسلنا على `{email}` فنخرج نطاقه من العيّنة والزحف ومن الإصدارات القادمة.',
          ],
          after: ['كل شيء مفتوح المصدر: الزاحف والقواعد وهذه الصفحة، فمن شاء راجعها.'],
        },
      ],
    },
    data: {
      title: 'البيانات',
      lead: 'الأرقام التي في هذه الصفحة وملفات للباحثين. حمّلها وأعد حسابها.',
      license: 'مرخّصة بـ CC BY 4.0: استخدمها بحرية مع ذكر المصدر.',
      licenseLink: 'نص الترخيص',
      download: 'تحميل',
      files: {
        'aggregates.json': 'أرقام التقرير: عدّاد لكل دولة ومنصّة ومقياس (JSON)',
        'aggregates.csv': 'الأرقام نفسها في CSV، صف لكل فئة في كل خلية',
        'aggregates.parquet': 'الأرقام نفسها بصيغة Parquet',
        'sites.parquet': 'صفحة رئيسية في كل صف بلا نطاق، بمعرّف مشفّر ومقاييسها (Parquet)',
        'schema.json': 'JSON Schema لجدولَي البيانات',
        'manifest.json': 'قائمة الملفات بأحجامها وبصمة SHA-256 لكل ملف',
      },
      frameFile: 'ملف عيّنة المواقع (CSV)',
      cite: 'الاقتباس',
      citeLead: 'إن استعملت الأرقام أو البيانات فاقتبسها هكذا:',
    },
    hub: {
      title: 'حالة الويب العربي',
      lead: 'تقرير سنوي ببيانات مفتوحة عن أداء أشهر المواقع على نطاقات الدول العربية في العرض العربي والجوال والأمان.',
      cta: 'افتح التقرير',
    },
    metrics: {
      'arabic-page': {
        title: 'صفحات رئيسية نصّها عربي في الغالب',
        hint: 'بحسب الحرف الغالب في نص الصفحة.',
      },
      shaping: {
        title: 'صفحات عربية تفكّك حروفها بالتباعد',
        hint: '`letter-spacing` على نص عربي يفصل الحروف التي يجب أن تتصل.',
      },
      'arabic-font': {
        title: 'صفحات عربية بمشكلة في الخط',
        hint: 'خط ويب بلا حروف عربية، أو ينقصه حروف تستخدمها الصفحة، أو خط لم يُحمَّل فعُرض النص بخط آخر.',
      },
      'mixed-digits': {
        title: 'صفحات تخلط أنظمة الأرقام',
        hint: 'أرقام غربية (123) وهندية (١٢٣) معاً.',
      },
      'sar-sign-used': {
        title: 'صفحات تستخدم رمز الريال السعودي الجديد',
        hint: 'الرمز U+20C1 من يونيكود 17.',
      },
      'sar-sign-glyph': {
        title: 'صفحات خطها بلا رمز الريال الجديد',
        hint: 'من الصفحات التي تستخدم الرمز: الخط لا يملكه، فيرسمه الجهاز أو يظهر مربعاً فارغاً.',
      },
      'rtl-lang': {
        title: 'صفحات عربية بلا اتجاه أو لغة صحيحين',
        hint: 'غياب `dir="rtl"` على `html` أو `lang` لا يعلن لغة بحروف عربية.',
      },
      'ai-readability': {
        title: 'صفحات عربية تعيق قراءة الآلة',
        hint: 'تطويل أو محارف خفية داخل الكلمات، أو نص لا يصل في HTML قبل تنفيذ السكربتات.',
      },
      'ai-blocked': {
        title: 'صفحات يمنع robots.txt فيها بحث الذكاء الاصطناعي',
        hint: 'منع زواحف مثل OAI-SearchBot وPerplexityBot.',
      },
      'mobile-overflow': {
        title: 'صفحات RTL أعرض من شاشة الجوال',
        hint: 'تمرّر الصفحة جانبياً على شاشة هاتف.',
      },
      'no-viewport': {
        title: 'صفحات بلا وسم viewport',
        hint: 'من غيره يعرض الجوال الصفحة كأنها لسطح المكتب.',
      },
      'crux-data': {
        title: 'مواقع لها بيانات مستخدمين حقيقيين في CrUX',
        hint: 'تقرير Chrome UX يغطي الموقع.',
      },
      lcp: {
        title: 'LCP: سرعة ظهور أكبر عنصر',
        hint: 'جيّد حتى 2.5 ثانية، ضعيف فوق 4 ثوانٍ، على الهاتف عند المئين 75.',
      },
      inp: {
        title: 'INP: سرعة الاستجابة للتفاعل',
        hint: 'جيّد حتى 200 ميلي ثانية، ضعيف فوق 500، على الهاتف عند المئين 75.',
      },
      cls: {
        title: 'CLS: ثبات التخطيط',
        hint: 'جيّد حتى 0.1، ضعيف فوق 0.25، على الهاتف عند المئين 75.',
      },
      'no-https': { title: 'صفحات بلا HTTPS', hint: 'الصفحة لا تنتهي على اتصال مشفّر.' },
      'no-hsts': {
        title: 'صفحات بلا ترويسة HSTS',
        hint: 'لا تُلزم المتصفح بالاتصال المشفّر.',
      },
      'no-csp': {
        title: 'صفحات بلا سياسة أمان المحتوى (CSP)',
        hint: 'لا ترويسة `Content-Security-Policy`.',
      },
      'no-nosniff': { title: 'صفحات بلا `nosniff`', hint: 'لا ترويسة `X-Content-Type-Options`.' },
      'no-frame-protection': {
        title: 'صفحات بلا حماية من التأطير',
        hint: 'لا `X-Frame-Options` ولا `frame-ancestors`.',
      },
      'no-referrer-policy': {
        title: 'صفحات بلا سياسة المُحيل',
        hint: 'لا ترويسة `Referrer-Policy`.',
      },
      headers: {
        title: 'عدد ترويسات الأمان الخمس التي ترسلها الصفحة',
        hint: 'HSTS وCSP وnosniff وحماية الإطارات وسياسة المُحيل.',
      },
      'json-ld': { title: 'صفحات تستخدم JSON-LD', hint: 'بيانات منظّمة بصيغة JSON-LD في الصفحة.' },
      'json-ld-broken': {
        title: 'صفحات فيها JSON-LD بخطأ في الصياغة',
        hint: 'من الصفحات التي تستخدمه: صياغة JSON لا تصحّ، فلا يقرؤه أحد.',
      },
      score: { title: 'درجة Arablyzer للصفحة', hint: 'من 0 إلى 100، في عشرات.' },
    },
    groups: {
      arabic: 'العربية',
      direction: 'الاتجاه واللغة',
      machines: 'قراءة الآلة',
      mobile: 'الجوال',
      speed: 'السرعة',
      security: 'الأمان',
      structure: 'البنية',
    },
    categories: {
      yes: 'نعم',
      no: 'لا',
      good: 'جيّد',
      'needs-improvement': 'يحتاج تحسيناً',
      poor: 'ضعيف',
    },
  },
  en: {
    meta: {
      title: 'State of the Arabic Web: Arablyzer’s yearly report',
      description:
        'A yearly report with open data on the homepages of the most visited sites on Arab country domains: Arabic rendering, RTL, mobile, speed and security, with a published method.',
    },
    breadcrumb: 'State of the Arabic Web',
    title: 'State of the Arabic Web',
    lead: 'How do the homepages of the most visited sites on Arab country domains do when every one is checked by the same rules? Real numbers with confidence intervals, a method published before the crawl, and open data.',
    contents: 'On this page',
    related: 'Related pages',
    soon: {
      kick: 'Soon',
      title: 'The first edition is coming soon',
      lead: 'The crawl has not finished, and we will not show a number before it has: everything here will come from a real check of each site in the sample. Until then the sample and the method are published for anyone to review.',
      items: [
        'The headline numbers, each with its confidence interval and the number of pages judged.',
        'A comparison of the Arab countries, and the share of platforms (Salla, Zid, WordPress, Shopify and others).',
        'A data explorer where you pick the country, the platform and the metric.',
        'The data files: Parquet, CSV and JSON with a JSON Schema, under CC BY 4.0.',
      ],
      frame:
        'The sample is published before the crawl: {sites} sites from Tranco list {list} ({date}) on {countries} country domains.',
      frameNoDate:
        'The sample is published before the crawl: {sites} sites from Tranco list {list} on {countries} country domains.',
    },
    edition: {
      label: 'Edition {edition}',
      reached: '{reached} homepages checked of {frame} sites in the sample',
      finished: 'The crawl ended on {date}',
      partial: 'The crawl is not finished: the numbers are for a random part of the sample.',
      engines: 'Browsers: {engines}',
    },
    findings: {
      title: 'Headline findings',
      lead: 'Each percentage is the share of homepages judged for that metric, weighted by the size of each country’s list. The range under it is the 95% confidence interval.',
      judged: 'of {n} pages judged',
      interval: '{lo} to {hi}',
    },
    countries: {
      title: 'Countries',
      lead: 'The share of pages in each country. The bar is the share, and the line around it is the 95% confidence interval.',
      table: 'Show the numbers as a table',
      columns: {
        country: 'Country',
        sites: 'Pages judged',
        share: 'Share',
        interval: '95% interval',
      },
      hidden:
        'A country with fewer than {min} pages judged is not shown, so that no number points at a few sites.',
      whole: 'The whole sample',
      bar: '{country}: {share} ({lo} to {hi})',
    },
    platforms: {
      title: 'Platforms',
      lead: 'What the page runs on, as the platform rule detects it. A platform is named when enough pages share it.',
      none: 'No platform recognised',
      other: 'Other platforms',
      share: 'of pages',
    },
    funnel: {
      title: 'What happened to the sample’s sites',
      lead: 'Not every site on the list is in the numbers. We show what happened to each, because a site we did not reach is not covered by the confidence intervals.',
      frame: 'Sites in the sample',
      reached: 'Pages checked and judged',
      skipped: 'Sites not checked',
      failed: 'Checks that failed',
      pending: 'Still waiting',
      reasons: {
        robots: 'robots.txt keeps the crawler out',
        'robots-unreachable': 'robots.txt could not be read',
        'bot-challenge': 'A bot-protection challenge',
        'http-error': 'The site answered with an error',
        unreachable: 'The site did not open',
        'not-html': 'The page is not HTML',
        'off-domain': 'The homepage moved to another domain',
        'opt-out': 'The owner asked to be left out',
        'no-page': 'No page to judge',
        other: 'Another reason',
      },
    },
    explorer: {
      title: 'Data explorer',
      lead: 'Pick a country, a platform and a metric to see its distribution. The page loads the numbers the first time you use it.',
      country: 'Country',
      platform: 'Platform',
      metric: 'Metric',
      allCountries: 'All countries',
      allPlatforms: 'All platforms',
      loading: 'Loading the numbers…',
      failed: 'The numbers could not be loaded. Download the files in the data section.',
      noScript:
        'The explorer needs JavaScript. The same numbers are in the tables above and in the data files.',
      tooFew: 'This selection has fewer than {min} pages judged, so we show no number.',
      judged: 'of {n} pages judged',
      weighted: 'The whole sample, weighted by the size of each country’s list',
      pooled: 'The share of the pages in the selection, unweighted',
    },
    frame: {
      title: 'The sample of sites',
      lead: 'The sites are those of the Tranco list of the million most visited domains that sit on an Arab country domain. The sample is published before the crawl so that anyone can review it.',
      caption: 'Sites in the sample, by country',
      country: 'Country',
      sites: 'Sites',
      total: 'Total',
    },
    method: {
      title: 'Method',
      sections: [
        {
          id: 'measured',
          title: 'What we measure',
          paragraphs: [
            'We check the homepage of each site, and only that, with the same Arablyzer rules any visitor checks their own site with: the code is deterministic, so the same page gives the same result. Each number is the share of the pages judged for that metric. A page a rule does not apply to (the direction check on a page that is not Arabic) is not in that number’s denominator.',
          ],
          items: [
            'Arabic rendering: letter-spacing that breaks the joining of letters, Arabic font problems, mixed digit systems, and the new Saudi riyal sign.',
            'Direction and language: `dir="rtl"` and `lang` on Arabic pages.',
            'Machine reading: words stretched with tatweel or holding invisible characters, text that is not in the HTML before scripts run, and AI search crawlers blocked in robots.txt.',
            'Mobile: a right-to-left page wider than a phone screen, and a missing viewport tag.',
            'Speed: the Core Web Vitals from the Chrome UX Report (real users on phones) where the site has data. We show no lab numbers, which change from run to run.',
            'Security: HTTPS and five headers: HSTS, CSP, nosniff, framing protection and a referrer policy.',
            'Structure: use of JSON-LD and whether it is well formed, the platform, and Arablyzer’s score.',
          ],
          after: [
            '«Letters pulled apart» means exactly `letter-spacing` on Arabic text, the one cause we detect with certainty in one browser. Shaping faults inside a font itself are not measured here.',
          ],
        },
        {
          id: 'frame',
          title: 'The sample',
          paragraphs: [
            'From the Tranco list (a fixed list id, recorded) we take every domain that ends in an Arab country domain: `.sa` `.ae` `.eg` `.kw` `.qa` `.bh` `.om` `.jo` `.ma` `.dz` `.tn` `.iq` `.lb` `.ly` `.sy` `.ye` `.sd` `.ps` `.mr`.',
            'If there are more than {cap} sites, each country gets a floor and the rest is shared by what each has left, and inside a country sites are chosen by a hash with a published seed, so the choice is random with respect to rank and gives the same result on any machine. The real numbers for the list are in the «The sample of sites» section above.',
            'The sample file is a CSV with the domain, the rank and the country and nothing else, in the project’s repository.',
          ],
        },
        {
          id: 'crawl',
          title: 'How we crawl',
          items: [
            'The homepage only (`https://`, then `http://`, then `www`). We follow no link, submit no form and bypass no bot protection.',
            'We read robots.txt as a crawler does: the `*` group counts, a block on `ArablyzerBot` is honoured, and a file we cannot read keeps us out. A site that blocks us is not checked.',
            'We identify ourselves on every request with the user agent `ArablyzerBot` and a page that explains how to block it.',
            'Visitors always come first: the crawl’s scan is last in the queue, and none is started while a visitor’s scan waits or runs or the server is busy, at a rate of no more than one scan every {interval} seconds, one at a time.',
            'Chromium alone by default. We keep no screenshots and no page text: for each site we keep a letter for the result of each rule and a few facts (the page’s language and direction, the platform, the CrUX figures and the score), and we delete the scan and its report straight away.',
          ],
        },
        {
          id: 'stats',
          title: 'How we count',
          items: [
            'Each share has a 95% confidence interval by Wilson’s method.',
            'The «whole sample» share is weighted by the size of each country’s list, not by how many of its pages we reached, so a small country that was given a floor does not outweigh a large one. Its interval uses the effective sample size that the weighted variance implies.',
            'A country’s or a platform’s share is the share of its pages, unweighted.',
            'We show no cell with fewer than {min} pages judged.',
          ],
          after: [
            'The interval measures the sample’s variation only. It does not cover the sites we did not reach (blocked, down, or behind protection) or a rule that misjudges a page. That is why we publish what happened to every site in the sample.',
          ],
        },
        {
          id: 'limits',
          title: 'Limits of this report',
          items: [
            'A country domain is not the country’s audience: some are used worldwide (`.ly` for link shorteners, for one), and some sites are a global company’s local branch.',
            'We do not cover Arabic sites on `.com`, `.net` and the like, nor internationalised domains, nor sites outside the top million. A later edition may add a second source.',
            'One homepage per site: it does not stand for the other pages or for what is behind a login.',
            'The result of one rule is not a verdict on a site’s quality.',
            'CrUX figures need a key and enough data for the site, so some sites have none.',
          ],
        },
        {
          id: 'ethics',
          title: 'Ethics and opting out',
          items: [
            'We publish no site’s name, rank or result. The numbers are aggregates, and the site rows in the data file carry no domain: an id hashed with a secret key that is not published and cannot be computed from the sample list.',
            'If you do not want your site checked, add `User-agent: ArablyzerBot` and `Disallow: /` to your robots.txt, or write to `{email}` and we take your domain out of the sample, the crawl and later editions.',
          ],
          after: ['All of it is open source: the crawler, the rules and this page.'],
        },
      ],
    },
    data: {
      title: 'The data',
      lead: 'The numbers on this page, and files for researchers. Download them and recompute.',
      license: 'Licensed CC BY 4.0: use it freely and credit the source.',
      licenseLink: 'The licence text',
      download: 'Download',
      files: {
        'aggregates.json':
          'The report’s numbers: counts for each country, platform and metric (JSON)',
        'aggregates.csv': 'The same numbers in CSV, one row for each category in each cell',
        'aggregates.parquet': 'The same numbers as Parquet',
        'sites.parquet':
          'One homepage per row, with no domain, a keyed id and its metrics (Parquet)',
        'schema.json': 'The JSON Schema of the two tables',
        'manifest.json': 'The list of files with their sizes and a SHA-256 of each',
      },
      frameFile: 'The sample of sites (CSV)',
      cite: 'How to cite',
      citeLead: 'If you use the numbers or the data, cite them like this:',
    },
    hub: {
      title: 'State of the Arabic Web',
      lead: 'A yearly report with open data on how the most visited sites on Arab country domains do on Arabic rendering, mobile and security.',
      cta: 'Open the report',
    },
    metrics: {
      'arabic-page': {
        title: 'Homepages written mostly in Arabic',
        hint: 'By the script that most of the page’s text is in.',
      },
      shaping: {
        title: 'Arabic pages that pull letters apart with spacing',
        hint: '`letter-spacing` on Arabic text separates letters that must join.',
      },
      'arabic-font': {
        title: 'Arabic pages with a font problem',
        hint: 'A web font with no Arabic letters or missing some the page uses, or a font that did not load so the text was drawn in another.',
      },
      'mixed-digits': {
        title: 'Pages that mix digit systems',
        hint: 'Western (123) and Eastern Arabic (١٢٣) digits together.',
      },
      'sar-sign-used': {
        title: 'Pages that use the new Saudi riyal sign',
        hint: 'The sign U+20C1 from Unicode 17.',
      },
      'sar-sign-glyph': {
        title: 'Pages whose font lacks the new riyal sign',
        hint: 'Of the pages that use the sign: the font has no glyph, so the device draws it or shows an empty box.',
      },
      'rtl-lang': {
        title: 'Arabic pages without a correct direction or language',
        hint: 'No `dir="rtl"` on `html`, or a `lang` that does not name a language written in Arabic script.',
      },
      'ai-readability': {
        title: 'Arabic pages that hinder machine reading',
        hint: 'Tatweel or invisible characters inside words, or text that is not in the HTML before scripts run.',
      },
      'ai-blocked': {
        title: 'Pages whose robots.txt blocks AI search',
        hint: 'A block on crawlers such as OAI-SearchBot and PerplexityBot.',
      },
      'mobile-overflow': {
        title: 'Right-to-left pages wider than a phone screen',
        hint: 'The page scrolls sideways on a phone.',
      },
      'no-viewport': {
        title: 'Pages with no viewport tag',
        hint: 'Without it a phone draws the page as if for a desktop.',
      },
      'crux-data': {
        title: 'Sites with real-user data in CrUX',
        hint: 'The Chrome UX Report covers the site.',
      },
      lcp: {
        title: 'LCP: how fast the largest element appears',
        hint: 'Good up to 2.5 seconds, poor over 4, on phones at the 75th percentile.',
      },
      inp: {
        title: 'INP: how fast the page answers a tap',
        hint: 'Good up to 200 milliseconds, poor over 500, on phones at the 75th percentile.',
      },
      cls: {
        title: 'CLS: how steady the layout is',
        hint: 'Good up to 0.1, poor over 0.25, on phones at the 75th percentile.',
      },
      'no-https': {
        title: 'Pages without HTTPS',
        hint: 'The page does not end on an encrypted connection.',
      },
      'no-hsts': {
        title: 'Pages without an HSTS header',
        hint: 'The browser is not told to keep to encrypted connections.',
      },
      'no-csp': {
        title: 'Pages without a Content Security Policy',
        hint: 'No `Content-Security-Policy` header.',
      },
      'no-nosniff': {
        title: 'Pages without `nosniff`',
        hint: 'No `X-Content-Type-Options` header.',
      },
      'no-frame-protection': {
        title: 'Pages with no framing protection',
        hint: 'No `X-Frame-Options` and no `frame-ancestors`.',
      },
      'no-referrer-policy': {
        title: 'Pages without a referrer policy',
        hint: 'No `Referrer-Policy` header.',
      },
      headers: {
        title: 'How many of the five security headers the page sends',
        hint: 'HSTS, CSP, nosniff, framing protection and a referrer policy.',
      },
      'json-ld': {
        title: 'Pages that use JSON-LD',
        hint: 'Structured data as JSON-LD in the page.',
      },
      'json-ld-broken': {
        title: 'Pages whose JSON-LD has a syntax error',
        hint: 'Of the pages that use it: the JSON is not valid, so nobody reads it.',
      },
      score: { title: 'Arablyzer’s score for the page', hint: 'From 0 to 100, in tens.' },
    },
    groups: {
      arabic: 'Arabic',
      direction: 'Direction and language',
      machines: 'Machine reading',
      mobile: 'Mobile',
      speed: 'Speed',
      security: 'Security',
      structure: 'Structure',
    },
    categories: {
      yes: 'Yes',
      no: 'No',
      good: 'Good',
      'needs-improvement': 'Needs improvement',
      poor: 'Poor',
    },
  },
}

import type { Copy } from './copy'
import { arabicCount, englishCount, RULES_NOMINATIVE } from './plural'

/** What the home page's strip says Arablyzer checks; each has a rule family behind it. */
export const TOPICS = [
  'ar-render',
  'rtl',
  'fonts',
  'forms',
  'whatsapp',
  'gulf-prices',
  'index',
  'speed',
  'schema',
  'ai',
] as const
export type Topic = (typeof TOPICS)[number]

interface Titled {
  readonly title: string
  readonly text: string
}

export interface HomeStrings {
  readonly meta: { readonly title: string; readonly description: string }
  readonly hero: {
    readonly kicker: string
    /** The heading, then its marked ending. */
    readonly title: string
    readonly titleMark: string
    readonly lead: string
    readonly promises: readonly [string, string, string]
  }
  /** The instrument panel beside the heading: one of our test pages, as the engine saw it. */
  readonly figure: {
    readonly label: string
    readonly source: string
    readonly joined: string
    readonly broken: string
    readonly score: string
    readonly scale: (score: number) => string
    readonly tally: (failed: number, passed: number) => string
  }
  readonly topics: { readonly label: string; readonly names: Readonly<Record<Topic, string>> }
  readonly how: { readonly title: string; readonly steps: readonly [Titled, Titled, Titled] }
  readonly arabic: {
    readonly kicker: string
    readonly title: string
    readonly intro: string
    /** The cards' headings; each card quotes the finding's own message under it. */
    readonly cards: {
      readonly spacing: string
      readonly overflow: string
      readonly name: string
      readonly price: string
    }
    readonly drawnBy: (engine: string) => string
    readonly rejected: string
    readonly overflowDiagram: (overflow: number, width: number, viewport: number) => string
  }
  readonly honest: {
    readonly kicker: string
    readonly title: string
    readonly points: readonly [Titled, Titled, Titled]
    /** The link under the methodology point, to the document it names. */
    readonly methodology: string
    readonly terminal: {
      readonly title: string
      /** A comment line above the output: which page it is. */
      readonly caption: (page: string) => string
      /** With `code` in backticks. */
      readonly footer: string
    }
  }
  readonly faq: {
    readonly kicker: string
    readonly title: string
    readonly items: readonly { readonly question: string; readonly answer: string }[]
  }
  readonly cta: { readonly title: string; readonly text: string }
}

export const HOME: Copy<HomeStrings> = {
  reviewed: false,
  ar: {
    meta: {
      title: 'Arablyzer: افحص موقعك كما يراه Google والزبون العربي',
      description:
        'أدوات مجانية بلا تسجيل تفتح صفحتك في ثلاثة متصفحات وتقيس اتصال الحروف العربية، واتجاه الصفحة، والخطوط، والنماذج، وأسعار الخليج، وأرشفة Google.',
    },
    hero: {
      kicker: 'محلّل المواقع العربية، من مختبر كلاود توبيا',
      title: 'افحص موقعك كما يراه Google',
      titleMark: 'والزبون العربي على جواله',
      lead: 'يفتح Arablyzer صفحتك في ثلاثة متصفحات ويقيس ما لا تقيسه الأدوات الأجنبية: اتصال الحروف، واتجاه الصفحة، والخطوط العربية، ونماذج تقبل اسم «محمد» والأرقام العربية.',
      promises: ['مجاني وبلا تسجيل', 'الكود مفتوح المصدر', 'لا نرسل نماذجك أبداً'],
    },
    figure: {
      label: 'مثال: نص عربي كما رسمته ثلاثة متصفحات',
      source: 'مثال من صفحة اختبار',
      joined: 'الحروف متصلة',
      broken: 'فراغات بين الحروف',
      score: 'درجة الصفحة',
      scale: (score) => `مقياس من 0 إلى 100، والمؤشر عند ${score}`,
      tally: (failed, passed) =>
        `${failed === 0 ? 'لم تفشل أي قاعدة' : `فشلت ${arabicCount(failed, RULES_NOMINATIVE)}`} · نجحت ${arabicCount(passed, RULES_NOMINATIVE)}`,
    },
    topics: {
      label: 'نفحص',
      names: {
        'ar-render': 'العرض العربي',
        rtl: 'الاتجاه RTL',
        fonts: 'الخطوط العربية',
        forms: 'النماذج',
        whatsapp: 'واتساب',
        'gulf-prices': 'أسعار الخليج',
        index: 'الأرشفة',
        speed: 'السرعة',
        schema: 'البيانات المنظّمة',
        ai: 'زواحف الذكاء الاصطناعي',
      },
    },
    how: {
      title: 'كيف يعمل',
      steps: [
        {
          title: 'ألصق الرابط',
          text: 'رابط صفحة واحدة، من موقعك أو من أي موقع عام. بلا حساب ولا بطاقة.',
        },
        {
          title: 'نفتحها في ثلاثة متصفحات',
          text: 'نجلبها باسم ArablyzerBot، ونعرضها في Chromium وFirefox وWebKit، ونقيس ما يراه الزائر فعلاً.',
        },
        {
          title: 'تقرير بالأدلة',
          text: 'لكل مشكلة: أين هي، ولماذا تهم، وكيف تُصلحها. والتقرير لا يظهر في محركات البحث.',
        },
      ],
    },
    arabic: {
      kicker: 'الطبقة العربية',
      title: 'ما لا تراه الأدوات الأجنبية',
      intro: 'أمثلة من صفحات اختبارنا: ما وجده Arablyzer، بكلماته نفسها، ومعه الدليل والقياس.',
      cards: {
        spacing: 'تباعد يقطع الحروف',
        overflow: 'صفحة أعرض من الشاشة',
        name: 'نموذج يرفض «محمد»',
        price: 'أسعار الخليج بثلاث منازل',
      },
      drawnBy: (engine) => `كما رسمه ${engine}`,
      rejected: 'المتصفح يرفض القيمة',
      overflowDiagram: (overflow, width, viewport) =>
        `عنصر عرضه ${width} بكسل خارج حافة شاشة عرضها ${viewport} بكسل، بمقدار ${overflow} بكسل`,
    },
    honest: {
      kicker: 'مفتوح وصادق',
      title: 'نقيس، ولا نخمّن',
      points: [
        {
          title: 'الكود مفتوح',
          text: 'كل سطر على GitHub بترخيص AGPL-3.0، وتقدر تشغّله على خادمك مجاناً.',
        },
        {
          title: 'المنهجية منشورة',
          text: 'كيف نحسب الدرجة، ووزن كل خطورة، مع مثال محسوب لكل وزن.',
        },
        {
          title: 'لا نخمّن',
          text: 'نفصل ما يفشل آلياً عمّا يحتاج عين إنسان. والذكاء الاصطناعي لا يضيف مخالفة ولا يغيّر درجة.',
        },
      ],
      methodology: 'اقرأ المنهجية',
      terminal: {
        title: 'للمطوّرين: سطر الأوامر',
        caption: (page) => `# صفحة الاختبار ${page}، في المتصفحات الثلاثة`,
        footer:
          'المحرّك نفسه في الموقع وفي سطر الأوامر: `--render` للعرض في المتصفحات، و`--json` للتقرير كاملاً، و`--fail-on serious` ليتوقف البناء عند مشكلة خطيرة.',
      },
    },
    faq: {
      kicker: 'أسئلة شائعة',
      title: 'قبل أن تبدأ',
      items: [
        {
          question: 'هل Arablyzer مجاني؟',
          answer:
            'كل أدوات الصفحة الواحدة مجانية وبلا تسجيل، وتبقى كذلك. والخطط المدفوعة، حين تأتي، للاستخدام الكثيف وحده: مراقبة مواقع كثيرة كل يوم، وزحف مواقع كاملة.',
        },
        {
          question: 'ماذا تحفظون من صفحتي؟',
          answer:
            'التقرير وحده: نتائج القواعد، ومقتطفات قصيرة من صفحتك دليلاً عليها. يفتحه رابطه، ولا يظهر في محركات البحث. ولا نحفظ من زيارتك ترويسات ولا كوكيز ولا عنوان IP: حدود الفحص تعدّ رمزاً مشتقاً منه، يتغيّر كل يوم ويُحذف حين تنتهي مدة الحدّ. ونموذج الفحص يستعمل Cloudflare Turnstile ليميّز الناس من البرامج الآلية، فيُحمَّل من Cloudflare حين تبدأ به.',
        },
        {
          question: 'هل تملؤون النماذج أو ترسلونها؟',
          answer:
            'لا نرسل أي نموذج أبداً. نكتب في الحقول داخل المتصفح قيماً مثل «محمد العبري»، ونسأله هل يقبلها، ثم نغادر الصفحة دون إرسال شيء.',
        },
        {
          question: 'لماذا ثلاثة متصفحات؟',
          answer:
            'لأن كل محرّك يرسم العربية بطريقته: في صفحة اختبارنا رسم WebKit وحده تباعد الحروف، ففصل حروفاً يجب أن تتصل. Chromium محرّك Chrome وEdge، وFirefox له محرّكه، وWebKit محرّك Safari، لكننا نشغّله على Linux، فهو قريب من Safari وليس مثله تماماً.',
        },
      ],
    },
    cta: {
      title: 'افحص صفحتك الآن',
      text: 'مجاناً، وبلا تسجيل. ولا يرى التقرير إلا من معه رابطه.',
    },
  },
  en: {
    meta: {
      title: 'Arablyzer: check your site as Google and Arabic readers see it',
      description:
        'Free tools, no sign-up: your page opened in three browsers, with Arabic letter joining, page direction, fonts, forms, Gulf prices and Google indexing measured.',
    },
    hero: {
      kicker: 'An Arabic website analyzer from CloudTopia Labs',
      title: 'Check your site as Google sees it,',
      titleMark: 'and as Arabic readers see it on their phones',
      lead: 'Arablyzer opens your page in three browsers and measures what other tools miss: whether Arabic letters join, the page’s direction, Arabic fonts, and forms that accept a name like «محمد» and Arabic digits.',
      promises: ['Free, no sign-up', 'Open source', 'We never submit your forms'],
    },
    figure: {
      label: 'Example: Arabic text as three browsers drew it',
      source: 'From one of our test pages',
      joined: 'Letters join',
      broken: 'Gaps between letters',
      score: 'Page score',
      scale: (score) => `Scale from 0 to 100, marked at ${score}`,
      tally: (failed, passed) =>
        `${failed === 0 ? 'No rule failed' : `${englishCount(failed, 'rule', 'rules')} failed`} · ${passed} passed`,
    },
    topics: {
      label: 'We check',
      names: {
        'ar-render': 'Arabic rendering',
        rtl: 'RTL direction',
        fonts: 'Arabic fonts',
        forms: 'Forms',
        whatsapp: 'WhatsApp',
        'gulf-prices': 'Gulf prices',
        index: 'Indexing',
        speed: 'Speed',
        schema: 'Structured data',
        ai: 'AI crawlers',
      },
    },
    how: {
      title: 'How it works',
      steps: [
        {
          title: 'Paste a link',
          text: 'One page, from your site or any public site. No account, no card.',
        },
        {
          title: 'We open it in three browsers',
          text: 'We fetch it as ArablyzerBot, render it in Chromium, Firefox and WebKit, and measure what a visitor actually sees.',
        },
        {
          title: 'A report with evidence',
          text: 'For every problem: where it is, why it matters, and how to fix it. Reports never appear in search engines.',
        },
      ],
    },
    arabic: {
      kicker: 'The Arabic layer',
      title: 'What other tools don’t see',
      intro:
        'Examples from our test pages: what Arablyzer found, in its own words, with the evidence and the measurement.',
      cards: {
        spacing: 'Spacing that breaks letters apart',
        overflow: 'A page wider than the screen',
        name: 'A form that rejects «محمد»',
        price: 'Gulf prices with three decimals',
      },
      drawnBy: (engine) => `As ${engine} drew it`,
      rejected: 'The browser rejects the value',
      overflowDiagram: (overflow, width, viewport) =>
        `An element ${width} pixels wide past the edge of a ${viewport}-pixel screen, by ${overflow} pixels`,
    },
    honest: {
      kicker: 'Open and honest',
      title: 'We measure. We don’t guess.',
      points: [
        {
          title: 'Open code',
          text: 'Every line is on GitHub under AGPL-3.0, and you can run it on your own server for free.',
        },
        {
          title: 'Published methodology',
          text: 'How the score is computed and what each severity weighs, with a worked example for each weight.',
        },
        {
          title: 'No guessing',
          text: 'We keep what fails automatically apart from what needs a human eye. AI never adds a finding or changes a score.',
        },
      ],
      methodology: 'Read the methodology',
      terminal: {
        title: 'For developers: the command line',
        caption: (page) => `# test page ${page}, in all three browsers`,
        footer:
          'The same engine runs the site and the command line: `--render` to render in browsers, `--json` for the whole report, and `--fail-on serious` to stop a build on a serious problem.',
      },
    },
    faq: {
      kicker: 'FAQ',
      title: 'Before you start',
      items: [
        {
          question: 'Is Arablyzer free?',
          answer:
            'Every single-page tool is free with no sign-up, and stays that way. Paid plans, when they come, are only for heavy use: monitoring many sites every day and crawling whole sites.',
        },
        {
          question: 'What do you keep from my page?',
          answer:
            'Only the report: the rules’ results, with short excerpts of your page as evidence. Its link opens it, and it never appears in search engines. From your visit we keep no headers, no cookies and no IP address: the scan limits count a code made from it, which changes every day and is deleted when the limit’s window ends. The scan form uses Cloudflare Turnstile to tell people from bots, so it loads from Cloudflare when you start on the form.',
        },
        {
          question: 'Do you fill in or submit forms?',
          answer:
            'We never submit a form. In the browser, we type values such as «محمد العبري» into the fields, ask the browser whether it accepts them, and leave without sending anything.',
        },
        {
          question: 'Why three browsers?',
          answer:
            'Because each engine draws Arabic its own way: on our test page, only WebKit drew the letter-spacing, pulling apart letters that should join. Chromium is the engine of Chrome and Edge, Firefox has its own, and WebKit is Safari’s; we run it on Linux, so it is close to Safari but not the same.',
        },
      ],
    },
    cta: {
      title: 'Check your page now',
      text: 'Free, no sign-up. Only people with its link can see the report.',
    },
  },
}

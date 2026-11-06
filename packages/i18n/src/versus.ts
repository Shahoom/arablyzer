import type { Copy } from './copy'

/**
 * The comparison pages (/compare/<competitor>): Arablyzer beside four tools people use to check a
 * website. Honest by construction: each row is a thing Arablyzer does (so the first cell is true
 * of our code), and a competitor's cell says only what that tool's own public pages state on the
 * day we read them (`checked`); where a page says nothing, the cell says "not stated", not "no".
 * The owner reads every sentence before the flag turns true: nothing here is a claim about a
 * competitor we could not source.
 */

export const VERSUS_SLUGS = [
  'shipwork',
  'seoptimer',
  'seobility',
  'pagespeed-insights',
  'lighthouse',
  'ahrefs-site-audit',
  'semrush-site-audit',
  'w3c-validator',
] as const
export type VersusSlug = (typeof VERSUS_SLUGS)[number]

/** How a cell reads: a mark and a word, never a colour alone. */
export type Mark = 'yes' | 'partial' | 'no' | 'unknown'

export interface VersusCell {
  readonly mark: Mark
  readonly text: string
}

export interface VersusPage {
  readonly name: string
  /** The competitor's own page, for the reader to check us against. */
  readonly url: string
  /** One line: what the tool is, in its own terms. */
  readonly tagline: string
  /** YYYY-MM-DD: the day their public pages were read for this table. */
  readonly checked: string
  /** What the two tools are, side by side, in a paragraph. */
  readonly summary: string
  /** Their cell for each row of `VersusStrings.rows`, in the same order. */
  readonly them: readonly VersusCell[]
  /** When their tool is the better choice: honest, specific. */
  readonly pickThem: readonly string[]
  /** When ours is. */
  readonly pickUs: readonly string[]
  /** The public pages their cells rest on, read on `checked`: each claim can be checked at its source. */
  readonly sources?: readonly { readonly label: string; readonly url: string }[]
}

export interface VersusStrings {
  readonly meta: { readonly title: string; readonly description: string }
  readonly hub: {
    readonly title: string
    readonly lead: string
    readonly breadcrumb: string
    /** A row of the index: «Arablyzer مقابل Shipwork». */
    readonly row: (name: string) => string
  }
  readonly page: {
    readonly title: (name: string) => string
    readonly description: (name: string) => string
    readonly breadcrumb: string
    readonly heading: (name: string) => string
    readonly kicker: string
    /** The aside's contents list: its name. */
    readonly contents: string
    readonly tableTitle: string
    readonly tableCaption: (name: string) => string
    readonly feature: string
    readonly checkedOn: (name: string) => string
    readonly visit: (name: string) => string
    readonly pickThem: (name: string) => string
    readonly pickUs: string
    readonly method: string
    readonly methodBody: string
    readonly tryIt: string
    readonly tryItLead: string
    readonly otherComparisons: string
    /** The sentence above the list of a page's sources. */
    readonly sourcesLead: string
  }
  readonly marks: Readonly<Record<Mark, string>>
  /** The rows, once: what we do, in the words of our own pages. */
  readonly rows: readonly { readonly feature: string; readonly us: VersusCell }[]
  readonly pages: Readonly<Record<VersusSlug, VersusPage>>
}

const yes = (text: string): VersusCell => ({ mark: 'yes', text })
const partial = (text: string): VersusCell => ({ mark: 'partial', text })
const no = (text: string): VersusCell => ({ mark: 'no', text })
const unknown = (text: string): VersusCell => ({ mark: 'unknown', text })

const CHECKED = '2026-10-10'

export const VERSUS_UI: Copy<VersusStrings> = {
  reviewed: false,
  ar: {
    meta: {
      title: 'مقارنات: Arablyzer مقابل أدوات فحص المواقع الأخرى',
      description:
        'مقارنة صريحة بين Arablyzer وأدوات فحص أخرى، منها Lighthouse وPageSpeed Insights وAhrefs وSemrush ومدقق W3C: ما يفحصه كل منها للمواقع العربية، وما هو مجاني، ومتى تختار غيرنا.',
    },
    hub: {
      title: 'مقارنات',
      lead: 'أدوات أخرى تفحص المواقع، ولكل منها ما يتفوق فيه. هذه مقارنات مبنية على ما يقوله كل موقع عن نفسه، وعلى ما نفعله نحن فعلاً.',
      breadcrumb: 'مسار الصفحة',
      row: (name) => `Arablyzer مقابل ${name}`,
    },
    page: {
      title: (name) => `Arablyzer مقابل ${name}: مقارنة للمواقع العربية`,
      description: (name) =>
        `ما يفحصه Arablyzer وما يفحصه ${name}، سطراً بسطر: فحوص العربية، محركات المتصفح، المنصات العربية، الحدود المجانية، ومتى تختار ${name}.`,
      breadcrumb: 'مسار الصفحة',
      heading: (name) => `Arablyzer مقابل ${name}`,
      kicker: 'مقارنة',
      contents: 'في هذه الصفحة',
      tableTitle: 'المقارنة سطراً بسطر',
      tableCaption: (name) => `ما يفعله Arablyzer وما تذكره صفحات ${name} العامة`,
      feature: 'الميزة',
      checkedOn: (name) => `قرأنا صفحات ${name} العامة في`,
      visit: (name) => `موقع ${name}`,
      pickThem: (name) => `متى تختار ${name}`,
      pickUs: 'متى تختار Arablyzer',
      method: 'كيف قارنّا',
      methodBody:
        'السطور هي ما يفعله Arablyzer فعلاً، ونقرؤها من شيفرته المفتوحة. وخانة الأداة الأخرى تقول ما تذكره صفحاتها العامة يوم القراءة، ولا شيء غيره: حيث لا تذكر الصفحة شيئاً نكتب «غير مذكور» لا «لا». لم نسجّل في أي أداة منها ولم نجرّب خططها المدفوعة. الأسعار والحدود تتغير، فتحقق من صفحاتهم قبل أن تقرر، وإن رأيت خطأً فأخبرنا ونصححه.',
      tryIt: 'جرّب بنفسك',
      tryItLead:
        'أدوات الصفحة الواحدة مجانية وبلا تسجيل. الصق عنوان موقعك وقارن النتيجة بما تعرفه.',
      otherComparisons: 'مقارنات أخرى',
      sourcesLead:
        'الصفحات العامة التي بنينا عليها خانات هذه الأداة، كما قرأناها في التاريخ المذكور أعلاه:',
    },
    marks: { yes: 'نعم', partial: 'جزئياً', no: 'لا', unknown: 'غير مذكور' },
    rows: [
      {
        feature: 'فحوص خاصة بالعربية',
        us: yes(
          'قواعد للحروف المقطّعة (letter-spacing)، وحروف ينقصها الخط، والتطويل، وخلط الأرقام، واتجاه RTL، ورمز الريال الجديد',
        ),
      },
      {
        feature: 'رسم الصفحة في متصفحات حقيقية',
        us: yes('Chromium وFirefox وWebKit، وتُقارَن النتائج بينها'),
      },
      {
        feature: 'اكتشاف المنصة',
        us: yes(
          'سلة وزد ويوكان (ExpandCart بثقة منخفضة) إلى جانب WordPress وغيرها، من بصمات الصفحة',
        ),
      },
      {
        feature: 'التسجيل قبل أول فحص',
        us: yes('غير مطلوب في أدوات الصفحة الواحدة'),
      },
      {
        feature: 'الحدود المجانية',
        us: partial('مجاني ضمن حدّ معدّل يحمي المواقع من الإغراق؛ الخطط المدفوعة لم تُحدَّد بعد'),
      },
      {
        feature: 'واجهة عربية وإنجليزية',
        us: yes('كل صفحة بالعربية أولاً وبالإنجليزية'),
      },
      {
        feature: 'الكود والمنهجية',
        us: yes('كود مفتوح بترخيص AGPL-3.0، ومكتبة القواعد تشرح كيف نكشف كل قاعدة'),
      },
      {
        feature: 'جاهزية الذكاء الاصطناعي',
        us: yes(
          'وصول زواحف الذكاء الاصطناعي، وقراءة النص العربي للآلة، وحجب الزواحف في robots.txt',
        ),
      },
      {
        feature: 'بيانات Core Web Vitals',
        us: partial(
          'نقرأ بيانات CrUX الميدانية (LCP وINP وCLS) ونقارنها بالدول، ولا نشغّل Lighthouse',
        ),
      },
      {
        feature: 'زحف الموقع كاملاً والمراقبة اليومية',
        us: no('غير متاحة بعد؛ هي الخطط المدفوعة القادمة وبلا أسعار حتى الآن'),
      },
    ],
    pages: {
      shipwork: {
        name: 'Shipwork',
        url: 'https://shipwork.io/',
        tagline: 'فاحص SEO تقني يقرأ موقعك كما يقرؤه Google وزواحف الذكاء الاصطناعي.',
        checked: CHECKED,
        summary:
          'Shipwork وArablyzer كلاهما فاحص لموقع عام بلا تثبيت. يقدّم Shipwork عدداً كبيراً من الفحوص التقنية العامة ومراقبة يومية مدفوعة، ونقدّم نحن عمقاً في ما يخص النص العربي والمتاجر العربية.',
        them: [
          unknown('لا تذكر صفحته العربية ولا RTL'),
          unknown('تذكر «فحصاً مُصيَّراً» دون تسمية المتصفح أو المحرك'),
          partial('تذكر فحوصاً أعمق لـ Shopify وWooCommerce، ولا تذكر سلة ولا زد'),
          yes('أول فحص كل شهر بلا تسجيل، وثانٍ مجاني بتسجيل الدخول'),
          partial('83 فحصاً مجانياً بحسب موقعه، وعدد الفحوص الشهرية محدود'),
          unknown('لا تذكر صفحته لغات الواجهة'),
          unknown('لا تذكر صفحته إن كان الكود مفتوحاً'),
          yes('يفحص وصول زواحف Google والذكاء الاصطناعي'),
          unknown('لا تذكر صفحته بيانات Core Web Vitals'),
          yes('مراقبة يومية بتنبيه بريدي لخمسة مواقع في خطة «Unlimited» من 12 دولاراً شهرياً'),
        ],
        pickThem: [
          'تريد مراقبة يومية بتنبيه بريدي لموقعك الآن، فهي عندهم مسعّرة ومتاحة.',
          'موقعك على Shopify أو WooCommerce وتريد فحوص الكتالوج التي يذكرها.',
        ],
        pickUs: [
          'موقعك عربي وتريد أن تعرف إن كانت حروفه تُرسم متصلة وأرقامه وأسعاره سليمة في كل المتصفحات.',
          'متجرك على سلة أو زد أو يوكان وتريد نصائح تناسب منصتك.',
          'تريد كوداً مفتوحاً ومنهجية مكتوبة لكل قاعدة.',
        ],
      },
      seoptimer: {
        name: 'SEOptimer',
        url: 'https://www.seoptimer.com/',
        tagline: 'تدقيق SEO سريع بتقارير PDF يمكن وسمها بعلامة الوكالة.',
        checked: CHECKED,
        summary:
          'يركّز SEOptimer على الوكالات: تدقيق من عنوان واحد، وتقارير PDF بشعارك، ونموذج يُدمج في موقعك لجمع العملاء. ونركّز نحن على ما يخص الصفحة العربية وعلى شرح كل نتيجة وكيف تُصلحها.',
        them: [
          unknown('لا تذكر صفحاته العامة فحوصاً خاصة بالعربية'),
          unknown('لا تذكر صفحته المتصفح الذي ترسم به الصفحة'),
          unknown('لا تذكر صفحته اكتشاف المنصة'),
          unknown('تعرض «تحليلاً مجانياً» ولا تقول إن كان التسجيل لازماً'),
          partial('تحليل مجاني وتجربة 14 يوماً للخطط، والأسعار في صفحة منفصلة'),
          partial('تقارير بعدة لغات، ولا تسرد الصفحة اللغات ولا تذكر العربية'),
          unknown('لا تذكر صفحته إن كان الكود مفتوحاً'),
          partial('تذكر مراجعات حديثة تدقيق GEO إلى جانب تدقيق SEO'),
          yes('تدقيق الأداء عندهم يشمل Core Web Vitals بحسب وصف المراجعات'),
          yes('زاحف لكل صفحات الموقع، وتقارير مجدولة؛ الحدود في خطط مدفوعة'),
        ],
        pickThem: [
          'أنت وكالة وتحتاج تقارير PDF بشعارك وألوانك لعملائك اليوم.',
          'تريد نموذجاً مدمجاً في موقعك يجمع عناوين العملاء المحتملين.',
        ],
        pickUs: [
          'تريد فحصاً يفهم الحروف العربية وعلامات الترقيم والأرقام والاتجاه، لا فحص SEO عاماً.',
          'تريد أن تقرأ لماذا فشلت كل قاعدة وكيف تُصلحها بكود جاهز.',
          'لا تريد تسجيلاً ولا بطاقة لتجربة الأدوات.',
        ],
      },
      seobility: {
        name: 'Seobility',
        url: 'https://www.seobility.net/en/seocheck/',
        tagline:
          'فاحص SEO مجاني يعطي درجة وقائمة مهام لصفحة واحدة، وتدقيقاً للموقع في الخطة المدفوعة.',
        checked: CHECKED,
        summary:
          'يقيّم Seobility صفحة واحدة بأكثر من 200 عامل ويرتّب المهام بأولويتها، ويفتح تدقيق الموقع كاملاً في خطة Premium. ويتشابه معنا في الحدّ الأول: صفحة واحدة بلا تسجيل؛ ونتفرد بفحوص العربية.',
        them: [
          unknown('لا تذكر صفحته العربية'),
          unknown('لا تذكر صفحته إن كانت الصفحة تُرسم في متصفح'),
          unknown('لا تذكر صفحته اكتشاف المنصة'),
          yes('أدواته المجانية بلا تسجيل بحسب صفحته، والتسجيل يرفع حدّ الاستعلامات اليومي'),
          yes('خطة Basic المجانية: 5 فحوص يومياً'),
          partial('الإنجليزية والألمانية والإسبانية؛ لا تُذكر العربية'),
          unknown('لا تذكر صفحته إن كان الكود مفتوحاً'),
          unknown('لا تذكر صفحته فحوص الذكاء الاصطناعي'),
          unknown('لا تذكر صفحته Core Web Vitals'),
          partial('تدقيق الموقع كاملاً في خطة Premium (50 فحصاً يومياً)'),
        ],
        pickThem: [
          'تريد درجة وقائمة مهام مرتّبة بالأولوية بواجهة إنجليزية أو ألمانية أو إسبانية.',
          'تحتاج تدقيق موقع كامل الآن وتقبل خطة مدفوعة.',
        ],
        pickUs: [
          'واجهتك عربية ونصوصك عربية، وتريد فحوصاً لا تعرفها الأدوات العامة.',
          'تريد التحقق من الصفحة في Chromium وFirefox وWebKit.',
          'متجرك عربي وتريد أن تعرف منصته وأخطاءها الشائعة.',
        ],
      },
      'pagespeed-insights': {
        name: 'PageSpeed Insights',
        url: 'https://pagespeed.web.dev/',
        tagline: 'أداة Google المجانية لقياس سرعة الصفحة ببيانات مختبرية وميدانية.',
        checked: CHECKED,
        summary:
          'PageSpeed Insights هو المرجع لسرعة الصفحة: تقرير Lighthouse المختبري وبيانات مستخدمين حقيقيين من CrUX لآخر 28 يوماً. وهو لا يفحص النص العربي، وهنا يأتي دورنا؛ والأداتان تكمّلان بعضهما.',
        them: [
          no('ليست خاصة بالعربية؛ لا تفحص اتصال الحروف ولا خطوطها'),
          partial('Chromium عبر Lighthouse، وجهاز محاكى واحد في كل تشغيل بحسب وثائقه'),
          partial('يعرض Lighthouse نصائح خاصة ببعض المنصات العالمية؛ راجع قائمتها لمنصتك'),
          yes('يعمل في الويب دون حساب'),
          yes('مجاني'),
          unknown('لا تذكر صفحته لغات الواجهة'),
          partial('Lighthouse مفتوح المصدر؛ الخدمة نفسها من Google'),
          no('لا يفحص وصول زواحف الذكاء الاصطناعي'),
          yes('بيانات مختبرية، وبيانات CrUX لآخر 28 يوماً عند الشريحة المئوية 75'),
          no('عنوان واحد في كل مرة، بلا مراقبة'),
        ],
        pickThem: [
          'تريد قراءة Core Web Vitals الميدانية الكاملة لصفحتك وموقعك، فهذا اختصاصه.',
          'تريد تقرير Lighthouse الكامل: الأداء وإمكانية الوصول وأفضل الممارسات وSEO.',
        ],
        pickUs: [
          'تريد أن تعرف لماذا تتقطع حروفك أو تظهر مربعات في الأسعار، وهو ما لا يراه Lighthouse.',
          'تريد مقارنة أداء موقعك حسب الدولة من بيانات CrUX.',
          'تريد فحوص الفهرسة وhreflang والذكاء الاصطناعي في أداة واحدة.',
        ],
      },
      lighthouse: {
        name: 'Lighthouse',
        url: 'https://developer.chrome.com/docs/lighthouse/overview',
        tagline:
          'أداة مفتوحة المصدر من Google تفحص جودة الصفحة: الأداء وإمكانية الوصول وSEO وغيرها.',
        checked: '2026-11-06',
        summary:
          'Lighthouse أداة تشغّلها أنت في Chrome DevTools أو من سطر الأوامر، أو عبر PageSpeed Insights، وتعطيك تقريراً عن الصفحة التي تحددها. فحوصها عامة لكل اللغات، ونحن نضيف فحوص النص العربي وعرضه في أكثر من محرك. والأداتان تكمّلان بعضهما.',
        them: [
          unknown('لا تذكر وثائقه فحوصاً خاصة بالنص العربي؛ فحوصه عامة، منها فحص hreflang'),
          partial(
            'يعمل في Chrome؛ وتشترط وثائقه وجود Google Chrome مثبتاً لتشغيله من سطر الأوامر أو كوحدة Node',
          ),
          unknown('لا تذكر وثائقه اكتشاف منصة المتجر'),
          yes('لا تذكر وثائقه حاجة إلى حساب؛ يعمل داخل Chrome DevTools أو من سطر الأوامر'),
          yes('مفتوح المصدر بترخيص Apache-2.0، وتشغّله بنفسك'),
          partial(
            'تُعرض وثائقه بالعربية والإنجليزية وغيرهما بحسب قائمة اللغات في موقعه؛ ولا تذكر لغة تقريره',
          ),
          yes(
            'مفتوح المصدر بترخيص Apache-2.0 على GitHub، ولكل فحص صفحة في وثائقه تشرح لماذا يهم وكيف يُصلح',
          ),
          unknown('لا تذكر وثائقه فحص وصول زواحف الذكاء الاصطناعي'),
          partial('بيانات مختبرية (Lab) من تشغيل الفحص نفسه، لا بيانات مستخدمين حقيقيين'),
          partial(
            'يفحص العنوان الذي تعطيه إياه في كل تشغيل؛ وتذكر وثائقه Lighthouse CI لمنع التراجع في المواقع',
          ),
        ],
        pickThem: [
          'تريد تقرير الأداء وإمكانية الوصول وأفضل الممارسات وSEO لصفحة واحدة في Chrome DevTools، أو تريد دمجه في سلسلة التكامل المستمر عندك.',
          'تريد فحص صفحات تتطلب تسجيل دخول، فوثائقه تقول إنه يعمل على الصفحات العامة وعلى ما يتطلب مصادقة.',
        ],
        pickUs: [
          'تريد فحوصاً للنص العربي لم نجدها بين مراجعات Lighthouse في وثائقه: اتصال الحروف والخطوط والأرقام والاتجاه.',
          'تريد رؤية الصفحة في Firefox وWebKit إلى جانب Chromium.',
          'متجرك على سلة أو زد أو يوكان وتريد نصائح تناسب منصتك.',
        ],
        sources: [
          {
            label: 'مقدمة Lighthouse في وثائق Chrome for Developers',
            url: 'https://developer.chrome.com/docs/lighthouse/overview',
          },
          {
            label: 'مراجعة hreflang في Lighthouse',
            url: 'https://developer.chrome.com/docs/lighthouse/seo/hreflang',
          },
          {
            label: 'مستودع Lighthouse على GitHub (الترخيص)',
            url: 'https://github.com/GoogleChrome/lighthouse',
          },
          {
            label: 'web.dev: الفرق بين بيانات المختبر وبيانات الميدان',
            url: 'https://web.dev/articles/lab-and-field-data-differences',
          },
        ],
      },
      'ahrefs-site-audit': {
        name: 'Ahrefs Site Audit',
        url: 'https://ahrefs.com/site-audit',
        tagline: 'أداة زحف من Ahrefs تفحص صفحات الموقع كلها بحثاً عن مشكلات SEO التقنية.',
        checked: '2026-11-06',
        summary:
          'Ahrefs Site Audit يزحف موقعك كله ويعرض مشكلاته مرتبة ومعها درجة لصحة الموقع، ضمن منصة SEO متكاملة. أما نحن فنفحص الصفحة التي تعطينا إياها فحصاً أعمق للنص العربي وعرضه. ومن يحتاج زحف الموقع ومراقبته فمكانه اليوم عند Ahrefs لا عندنا.',
        them: [
          unknown(
            'تذكر صفحاته أكثر من 170 مشكلة تقنية عامة، منها فئة «Localization»، ولا تذكر فحوصاً خاصة بالنص العربي',
          ),
          partial('تذكر صفحته تنفيذ JavaScript وزحف نسخة الجوال، ولا تسمّي المتصفح'),
          unknown('لا تذكر صفحته اكتشاف منصة المتجر'),
          no('يتطلب حساباً؛ فالفحص المجاني للمواقع التي تتحقق من ملكيتها في Ahrefs Free'),
          partial(
            'مجاني للمواقع الموثّقة بـ 5 آلاف رصيد زحف شهرياً لكل مشروع؛ وخطة Lite بـ 129 دولاراً شهرياً بحسب صفحة الأسعار',
          ),
          unknown('لا تذكر صفحاته لغات الواجهة'),
          unknown('لا تذكر صفحاته إن كان الكود مفتوحاً'),
          unknown('لا تذكر صفحة Site Audit فحص وصول زواحف الذكاء الاصطناعي'),
          yes('تذكر صفحته فئة Core Web Vitals وقياس مؤشرات CrUX وLighthouse للصفحات'),
          yes(
            'يزحف صفحات الموقع كلها، وتذكر صفحته «Always-on audits» التي تزحف الموقع على مدار الساعة، وهي في قائمة ميزات الخطط المدفوعة',
          ),
        ],
        pickThem: [
          'تريد زحف الموقع كله وتتبّع صحته على مدى الوقت، فهذا اختصاص Site Audit.',
          'تريد مع الفحص التقني بيانات الروابط الخلفية والكلمات المفتاحية في منصة واحدة.',
        ],
        pickUs: [
          'موقعك عربي وتريد أن تعرف إن كانت حروفه تُرسم متصلة وأرقامه وأسعاره سليمة في المتصفحات.',
          'تريد فحص صفحة بلا حساب ولا توثيق لملكية الموقع.',
          'متجرك على سلة أو زد أو يوكان وتريد نصائح تناسب منصتك.',
        ],
        sources: [
          { label: 'Ahrefs Site Audit', url: 'https://ahrefs.com/site-audit' },
          {
            label: 'Ahrefs Free (Webmaster Tools سابقاً)',
            url: 'https://ahrefs.com/webmaster-tools',
          },
          { label: 'أسعار Ahrefs', url: 'https://ahrefs.com/pricing' },
        ],
      },
      'semrush-site-audit': {
        name: 'Semrush Site Audit',
        url: 'https://www.semrush.com/features/site-audit/',
        tagline:
          'أداة من Semrush تفحص موقعك بحثاً عن أخطاء تقنية تمنع محركات البحث وأنظمة الذكاء الاصطناعي من الوصول إليه.',
        checked: '2026-11-06',
        summary:
          'Semrush Site Audit يزحف الموقع ويرتب مشكلاته بحسب خطورتها ويتتبع صحته، وهو جزء من منصة أوسع للتسويق عبر البحث. أما نحن فنفحص الصفحة نفسها فحصاً عميقاً للنص العربي وعرضه. ولكل أداة ما تتفوق فيه.',
        them: [
          unknown(
            'لا تذكر صفحاتها فحوصاً خاصة بالنص العربي؛ تذكر قائمة فحوصها فحوصاً عامة، منها فحوص hreflang',
          ),
          partial(
            'في إعدادات الزحف خيار «JS rendering» ينفّذ ملفات JavaScript، ولا تسمّي وثائقه متصفحاً',
          ),
          unknown('لا تذكر صفحاتها اكتشاف منصة المتجر'),
          no(
            'يتطلب حساباً؛ تجربة مجانية سبعة أيام، وخطة مجانية بلا بطاقة ائتمان بحسب صفحتي الميزة والأسعار',
          ),
          partial(
            'خطة مجانية «لتجربة المنصة» بمشروع تجريبي واحد و10 تقارير يومياً؛ وخطة SEO المدفوعة بـ 139 دولاراً شهرياً بحسب صفحة الأسعار',
          ),
          unknown('لا تذكر صفحاتها لغات الواجهة'),
          unknown('لا تذكر صفحاتها إن كان الكود مفتوحاً'),
          yes(
            'فحوص لبحث الذكاء الاصطناعي منها ملفات llms.txt بحسب وثائقها، وقوائم بصفحات تحجب زواحف أنظمة مثل ChatGPT وGoogle بحسب صفحتها',
          ),
          unknown('لا تذكرها الصفحات التي قرأناها'),
          yes(
            'يزحف الموقع كله، ويحدّث بياناته يومياً أو أسبوعياً أو شهرياً مع تنبيهات فورية بحسب صفحته؛ وتذكر صفحة الأسعار Site Audit ضمن الخطة المدفوعة',
          ),
        ],
        pickThem: [
          'تريد زحف الموقع كله بتنبيهات وتقارير دورية جاهزة للمشاركة.',
          'تريد Site Audit ضمن منصة واحدة مع بحث الكلمات المفتاحية وتتبع الترتيب.',
        ],
        pickUs: [
          'موقعك عربي وتريد أن تعرف إن كانت حروفه تُرسم متصلة وأرقامه وأسعاره سليمة في المتصفحات.',
          'تريد فحص صفحة بلا حساب ولا تجربة مؤقتة.',
          'متجرك على سلة أو زد أو يوكان وتريد نصائح تناسب منصتك.',
        ],
        sources: [
          { label: 'صفحة ميزة Site Audit', url: 'https://www.semrush.com/features/site-audit/' },
          {
            label: 'قائمة مشكلات Site Audit في قاعدة المعرفة',
            url: 'https://www.semrush.com/kb/542-site-audit-issues-list',
          },
          {
            label: 'إعدادات Site Audit في قاعدة المعرفة',
            url: 'https://www.semrush.com/kb/539-configuring-site-audit',
          },
          { label: 'أسعار Semrush', url: 'https://www.semrush.com/pricing/' },
        ],
      },
      'w3c-validator': {
        name: 'W3C Markup Validator',
        url: 'https://validator.w3.org/',
        tagline: 'خدمة مجانية من W3C تتحقق من صحة وسوم الصفحات بحسب المواصفات.',
        checked: '2026-11-06',
        summary:
          'مدقق W3C يقرأ وسوم صفحتك ويقارنها بمواصفات HTML، وتقول صفحته نفسها إن التحقق ليس فحص جودة كاملاً. وما نفحصه نحن مختلف: النص العربي وعرضه والفهرسة. وقد يلزمك الفحصان معاً.',
        them: [
          partial(
            'يعرض الترميزين العربيين iso-8859-6-i وwindows-1256 بين خيارات ترميز الأحرف، ولا تذكر صفحاته فحوصاً لاتصال الحروف أو الاتجاه',
          ),
          no('يقارن وسوم المستند بالمواصفات، ولا تصف صفحته رسم الصفحة في متصفح'),
          no('خارج ما تصفه صفحته: التحقق من صحة الوسوم'),
          yes('يتحقق من عنوان أو ملف مرفوع أو نص تلصقه، ولا تذكر صفحته حاجة إلى حساب'),
          yes('خدمة مجانية من W3C بحسب صفحة التعريف'),
          unknown('لا تذكر صفحته لغات الواجهة'),
          yes(
            'فاحص HTML5 (Nu Html Checker) مفتوح المصدر بترخيص MIT على GitHub، وتشرح صفحته كيف تشغّل نسختك منه',
          ),
          no('خارج ما تصفه صفحته: التحقق من صحة الوسوم'),
          no('خارج ما تصفه صفحته: التحقق من صحة الوسوم'),
          no('يتحقق من مستند واحد في كل مرة: عنوان أو ملف أو نص'),
        ],
        pickThem: [
          'تريد التأكد أن وسوم HTML صحيحة بحسب المواصفات؛ فنحن لا نقدّم تحققاً شاملاً من مطابقة الوسوم لها.',
          'تريد تشغيل فاحص HTML5 على جهازك أو في سلسلة التكامل المستمر، فصفحته تشرح تشغيل نسخة خاصة منه.',
        ],
        pickUs: [
          'تريد أن تعرف إن كانت الحروف العربية تُرسم متصلة والأرقام والأسعار سليمة في Chromium وFirefox وWebKit.',
          'تريد فحوص الفهرسة وhreflang وإتاحة المحتوى للذكاء الاصطناعي.',
          'تريد نصائح لمتجرك على سلة أو زد أو يوكان.',
        ],
        sources: [
          { label: 'مدقق W3C: الصفحة الرئيسية', url: 'https://validator.w3.org/' },
          { label: 'مدقق W3C: عن الخدمة', url: 'https://validator.w3.org/about.html' },
          {
            label: 'فاحص Nu Html Checker: عن الأداة',
            url: 'https://validator.w3.org/nu/about.html',
          },
          {
            label: 'مستودع Nu Html Checker على GitHub (الترخيص)',
            url: 'https://github.com/validator/validator',
          },
        ],
      },
    },
  },
  en: {
    meta: {
      title: 'Comparisons: Arablyzer against other website checkers',
      description:
        'An honest comparison of Arablyzer with other website checkers, among them Lighthouse, PageSpeed Insights, Ahrefs, Semrush and the W3C validator: what each checks for Arabic websites, what is free, and when to pick the other tool.',
    },
    hub: {
      title: 'Comparisons',
      lead: 'Other tools check websites too, and each is better at something. These comparisons rest on what each tool says about itself and on what we actually do.',
      breadcrumb: 'Breadcrumb',
      row: (name) => `Arablyzer vs ${name}`,
    },
    page: {
      title: (name) => `Arablyzer vs ${name}: a comparison for Arabic websites`,
      description: (name) =>
        `What Arablyzer checks and what ${name} checks, line by line: Arabic checks, browser engines, Arab platforms, free limits, and when to pick ${name}.`,
      breadcrumb: 'Breadcrumb',
      heading: (name) => `Arablyzer vs ${name}`,
      kicker: 'Comparison',
      contents: 'On this page',
      tableTitle: 'Line by line',
      tableCaption: (name) => `What Arablyzer does and what ${name}'s public pages state`,
      feature: 'Feature',
      checkedOn: (name) => `We read ${name}'s public pages on`,
      visit: (name) => `${name}'s site`,
      pickThem: (name) => `When to pick ${name}`,
      pickUs: 'When to pick Arablyzer',
      method: 'How we compared',
      methodBody:
        "The rows are what Arablyzer really does, which you can read in its open code. The other tool's cell says what its public pages state on the day we read them, and nothing else: where a page says nothing, the cell reads “Not stated”, not “No”. We did not sign up to any of them or try their paid plans. Prices and limits change, so check their pages before you decide, and if you spot a mistake, tell us and we will fix it.",
      tryIt: 'Try it yourself',
      tryItLead:
        'Every single-page tool is free with no sign-up. Paste your address and compare the result with what you know.',
      otherComparisons: 'Other comparisons',
      sourcesLead: 'The public pages this tool’s cells rest on, as we read them on the date above:',
    },
    marks: { yes: 'Yes', partial: 'Partly', no: 'No', unknown: 'Not stated' },
    rows: [
      {
        feature: 'Checks made for Arabic',
        us: yes(
          'Rules for broken letters (letter-spacing), fonts missing letters, tatweel, mixed digits, RTL direction, and the new riyal sign',
        ),
      },
      {
        feature: 'Page drawn in real browsers',
        us: yes('Chromium, Firefox and WebKit, with the results compared'),
      },
      {
        feature: 'Platform detection',
        us: yes(
          'Salla, Zid and YouCan (ExpandCart at low confidence) beside WordPress and others, from the page’s fingerprints',
        ),
      },
      {
        feature: 'Sign-up before the first check',
        us: yes('Not needed for the single-page tools'),
      },
      {
        feature: 'Free limits',
        us: partial(
          'Free within a rate limit that keeps sites from being flooded; paid plans are not set yet',
        ),
      },
      {
        feature: 'Arabic and English interface',
        us: yes('Every page in Arabic first, and in English'),
      },
      {
        feature: 'Code and method',
        us: yes('Open source under AGPL-3.0, and the rule library explains how each rule detects'),
      },
      {
        feature: 'AI readiness',
        us: yes('AI crawler access, how machines read Arabic text, and robots.txt blocks'),
      },
      {
        feature: 'Core Web Vitals data',
        us: partial(
          'We read CrUX field data (LCP, INP, CLS) and compare it by country; we do not run Lighthouse',
        ),
      },
      {
        feature: 'Whole-site crawl and daily monitoring',
        us: no('Not available yet; they are the paid plans to come, with no prices so far'),
      },
    ],
    pages: {
      shipwork: {
        name: 'Shipwork',
        url: 'https://shipwork.io/',
        tagline: 'A technical SEO checker that reads your site the way Google and AI crawlers do.',
        checked: CHECKED,
        summary:
          'Shipwork and Arablyzer are both checkers for a public site, with nothing to install. Shipwork offers many general technical checks and paid daily monitoring; we go deeper on Arabic text and Arab online stores.',
        them: [
          unknown('Its page mentions neither Arabic nor RTL'),
          unknown('It lists a “rendered check” without naming the browser or engine'),
          partial(
            'It mentions deeper catalogue checks for Shopify and WooCommerce, and does not mention Salla or Zid',
          ),
          yes('The first check each month needs no sign-up, and a second is free with a sign-in'),
          partial('83 free checks by its own count, and a limited number of checks a month'),
          unknown('Its page does not state interface languages'),
          unknown('Its page does not say whether the code is open'),
          yes('Checks access for Google and AI crawlers'),
          unknown('Its page does not mention Core Web Vitals data'),
          yes(
            'Daily monitoring with an email alert for five sites on the “Unlimited” plan, from $12 a month',
          ),
        ],
        pickThem: [
          'You want daily monitoring with an email alert for your site now: it is priced and available there.',
          'Your site is on Shopify or WooCommerce and you want the catalogue checks it mentions.',
        ],
        pickUs: [
          'Your site is Arabic and you want to know whether its letters join, and its digits and prices are right, in every browser.',
          'Your store is on Salla, Zid or YouCan and you want advice that fits your platform.',
          'You want open code and a written method for every rule.',
        ],
      },
      seoptimer: {
        name: 'SEOptimer',
        url: 'https://www.seoptimer.com/',
        tagline: 'A quick SEO audit with PDF reports that can carry an agency’s brand.',
        checked: CHECKED,
        summary:
          'SEOptimer is built around agencies: an audit from one address, PDF reports with your logo, and a form to embed on your site to collect leads. We focus on the Arabic page and on explaining each result and how to fix it.',
        them: [
          unknown('Its public pages mention no checks made for Arabic'),
          unknown('Its page does not name the browser a page is drawn in'),
          unknown('Its page does not mention platform detection'),
          unknown('It offers a “free analysis” and does not say whether sign-up is needed'),
          partial('A free analysis and a 14-day trial of its plans; prices are on a separate page'),
          partial('Reports in several languages; the page lists none and does not mention Arabic'),
          unknown('Its page does not say whether the code is open'),
          partial('Recent reviews mention a GEO audit beside the SEO audit'),
          yes('Its performance audit includes Core Web Vitals, as reviews describe it'),
          yes(
            'A crawler for every page of a site, and scheduled reports; the limits are in paid plans',
          ),
        ],
        pickThem: [
          'You are an agency and need PDF reports with your logo and colours for clients today.',
          'You want a form embedded in your site that collects leads’ addresses.',
        ],
        pickUs: [
          'You want a check that understands Arabic letters, punctuation, digits and direction, not a general SEO check.',
          'You want to read why each rule failed and how to fix it with ready code.',
          'You do not want to sign up or give a card to try the tools.',
        ],
      },
      seobility: {
        name: 'Seobility',
        url: 'https://www.seobility.net/en/seocheck/',
        tagline:
          'A free SEO checker that gives a score and a task list for one page, and a site audit on a paid plan.',
        checked: CHECKED,
        summary:
          'Seobility rates one page on more than 200 factors and orders the tasks by priority, with a whole-site audit on the Premium plan. It is close to us at the first step, one page without sign-up; we are different in the Arabic checks.',
        them: [
          unknown('Its page does not mention Arabic'),
          unknown('Its page does not say whether pages are drawn in a browser'),
          unknown('Its page does not mention platform detection'),
          yes(
            'Its free tools need no registration by its page; registering raises the daily quota',
          ),
          yes('The free Basic plan: 5 checks a day'),
          partial('English, German and Spanish; Arabic is not listed'),
          unknown('Its page does not say whether the code is open'),
          unknown('Its page does not mention AI checks'),
          unknown('Its page does not mention Core Web Vitals'),
          partial('Whole-site audits on the Premium plan (50 checks a day)'),
        ],
        pickThem: [
          'You want a score and a prioritised task list in an English, German or Spanish interface.',
          'You need a whole-site audit now and accept a paid plan.',
        ],
        pickUs: [
          'Your interface and text are Arabic and you want checks general tools do not have.',
          'You want the page verified in Chromium, Firefox and WebKit.',
          'Your store is Arabic and you want to know its platform and the usual mistakes on it.',
        ],
      },
      'pagespeed-insights': {
        name: 'PageSpeed Insights',
        url: 'https://pagespeed.web.dev/',
        tagline: 'Google’s free tool for page speed, with lab data and field data.',
        checked: CHECKED,
        summary:
          'PageSpeed Insights is the reference for page speed: a Lighthouse lab report and real-user data from CrUX for the last 28 days. It does not check Arabic text, which is where we come in; the two tools complement each other.',
        them: [
          no('Not made for Arabic; it does not check letter joining or fonts'),
          partial(
            'Chromium through Lighthouse, one simulated device for each run, per its documentation',
          ),
          partial('Lighthouse shows advice for some global platforms; check its list for yours'),
          yes('Works on the web with no account'),
          yes('Free'),
          unknown('Its page does not state interface languages'),
          partial('Lighthouse is open source; the service itself is Google’s'),
          no('It does not check AI crawler access'),
          yes('Lab data, and CrUX data for the last 28 days at the 75th percentile'),
          no('One address at a time, with no monitoring'),
        ],
        pickThem: [
          'You want the full field Core Web Vitals of your page and site: this is its specialty.',
          'You want the complete Lighthouse report: performance, accessibility, best practices and SEO.',
        ],
        pickUs: [
          'You want to know why your letters break or boxes appear in prices, which Lighthouse does not see.',
          'You want your site’s performance by country from CrUX data.',
          'You want indexing, hreflang and AI checks in one tool.',
        ],
      },
      lighthouse: {
        name: 'Lighthouse',
        url: 'https://developer.chrome.com/docs/lighthouse/overview',
        tagline:
          'Google’s open-source tool that audits a page’s quality: performance, accessibility, SEO and more.',
        checked: '2026-11-06',
        summary:
          'Lighthouse is a tool you run yourself, in Chrome DevTools, from the command line or through PageSpeed Insights, and it reports on the page you point it at. Its audits are general to every language; we add checks for Arabic text and how it renders in more than one engine. The two tools complement each other.',
        them: [
          unknown(
            'Its documentation lists no checks made for Arabic text; its audits are general, hreflang among them',
          ),
          partial(
            'Runs in Chrome; its documentation requires Google Chrome installed to run it from the command line or as a Node module',
          ),
          unknown('Its documentation does not state store-platform detection'),
          yes(
            'Its documentation states no account; it runs inside Chrome DevTools or from the command line',
          ),
          yes('Open source under Apache-2.0, and you run it yourself'),
          partial(
            'Its documentation is offered in Arabic, English and other languages per the language list on its site; its report language is not stated',
          ),
          yes(
            'Open source under Apache-2.0 on GitHub, and each audit has a documentation page explaining why it matters and how to fix it',
          ),
          unknown('Its documentation does not state a check for AI crawler access'),
          partial('Lab data from running the audit itself, not real-user data'),
          partial(
            'Audits the address you give it in each run; its documentation mentions Lighthouse CI to prevent regressions on sites',
          ),
        ],
        pickThem: [
          'You want the performance, accessibility, best-practices and SEO report for one page in Chrome DevTools, or you want to wire it into your continuous integration.',
          'You want to audit pages that require sign-in: its documentation says it runs on any page, public or requiring authentication.',
        ],
        pickUs: [
          'You want checks for Arabic text that we did not find among the audits in Lighthouse’s documentation: letter joining, fonts, digits and direction.',
          'You want to see the page in Firefox and WebKit beside Chromium.',
          'Your store is on Salla, Zid or YouCan and you want advice that fits your platform.',
        ],
        sources: [
          {
            label: 'Introduction to Lighthouse, Chrome for Developers',
            url: 'https://developer.chrome.com/docs/lighthouse/overview',
          },
          {
            label: 'Lighthouse hreflang audit',
            url: 'https://developer.chrome.com/docs/lighthouse/seo/hreflang',
          },
          {
            label: 'Lighthouse repository on GitHub (license)',
            url: 'https://github.com/GoogleChrome/lighthouse',
          },
          {
            label: 'web.dev: Why lab and field data can be different',
            url: 'https://web.dev/articles/lab-and-field-data-differences',
          },
        ],
      },
      'ahrefs-site-audit': {
        name: 'Ahrefs Site Audit',
        url: 'https://ahrefs.com/site-audit',
        tagline: 'Ahrefs’ crawler that checks all of a site’s pages for technical SEO issues.',
        checked: '2026-11-06',
        summary:
          'Ahrefs Site Audit crawls your whole site and lists its issues, ranked and with a health score, inside a complete SEO platform. We check the page you give us, in more depth for Arabic text and how it renders. Whoever needs site-wide crawling and monitoring belongs with Ahrefs today, not with us.',
        them: [
          unknown(
            'Its pages state more than 170 general technical issues, a “Localization” category among them, and no checks made for Arabic text',
          ),
          partial(
            'Its page states JavaScript execution and crawling the mobile version, and does not name the browser',
          ),
          unknown('Its page does not state store-platform detection'),
          no(
            'Needs an account; the free audit is for websites whose ownership you verify in Ahrefs Free',
          ),
          partial(
            'Free for verified websites with 5 thousand crawl credits a month per project; the Lite plan is 129 dollars a month per its pricing page',
          ),
          unknown('Its pages do not state interface languages'),
          unknown('Its pages do not state whether the code is open'),
          unknown('Its Site Audit page does not state a check for AI crawler access'),
          yes(
            'Its page states a Core Web Vitals category and measuring CrUX and Lighthouse metrics for pages',
          ),
          yes(
            'Crawls all the site’s pages, and its page states “Always-on audits” that crawl the site around the clock, which are in the paid plans’ feature list',
          ),
        ],
        pickThem: [
          'You want to crawl the whole site and follow its health over time: this is what Site Audit is for.',
          'You want backlink and keyword data beside the technical audit, in one platform.',
        ],
        pickUs: [
          'Your site is Arabic and you want to know whether its letters join and its digits and prices are right in the browsers.',
          'You want to check a page with no account and no proof of site ownership.',
          'Your store is on Salla, Zid or YouCan and you want advice that fits your platform.',
        ],
        sources: [
          { label: 'Ahrefs Site Audit', url: 'https://ahrefs.com/site-audit' },
          {
            label: 'Ahrefs Free (formerly Webmaster Tools)',
            url: 'https://ahrefs.com/webmaster-tools',
          },
          { label: 'Ahrefs pricing', url: 'https://ahrefs.com/pricing' },
        ],
      },
      'semrush-site-audit': {
        name: 'Semrush Site Audit',
        url: 'https://www.semrush.com/features/site-audit/',
        tagline:
          'Semrush’s tool for technical errors that keep search engines and AI systems from reaching a site.',
        checked: '2026-11-06',
        summary:
          'Semrush Site Audit crawls the site, ranks its issues by severity and tracks its health, as part of a wider search-marketing platform. We check the page itself, deeply, for Arabic text and how it renders. Each tool is better at something.',
        them: [
          unknown(
            'Its pages state no checks made for Arabic text; its list of checks is general, with hreflang checks among them',
          ),
          partial(
            'Its crawl settings have a “JS rendering” option that executes JavaScript files, and its documentation does not name a browser',
          ),
          unknown('Its pages do not state store-platform detection'),
          no(
            'Needs an account; a 7-day free trial, and a free plan with no credit card per its feature and pricing pages',
          ),
          partial(
            'A free plan “for trying out the platform” with one demo project and 10 reports a day; the paid SEO plan is 139 dollars a month per its pricing page',
          ),
          unknown('Its pages do not state interface languages'),
          unknown('Its pages do not state whether the code is open'),
          yes(
            'Checks for AI search, llms.txt files among them per its documentation, and lists of pages that block bots of systems like ChatGPT and Google per its page',
          ),
          unknown('The pages we read do not state it'),
          yes(
            'Crawls the whole site and refreshes its data daily, weekly or monthly with real-time alerts per its page; its pricing page lists Site Audit in the paid plan',
          ),
        ],
        pickThem: [
          'You want to crawl the whole site, with alerts and scheduled reports ready to share.',
          'You want Site Audit inside one platform with keyword research and rank tracking.',
        ],
        pickUs: [
          'Your site is Arabic and you want to know whether its letters join and its digits and prices are right in the browsers.',
          'You want to check a page with no account and no trial period.',
          'Your store is on Salla, Zid or YouCan and you want advice that fits your platform.',
        ],
        sources: [
          { label: 'Site Audit feature page', url: 'https://www.semrush.com/features/site-audit/' },
          {
            label: 'Site Audit issues list, knowledge base',
            url: 'https://www.semrush.com/kb/542-site-audit-issues-list',
          },
          {
            label: 'Configuring Site Audit, knowledge base',
            url: 'https://www.semrush.com/kb/539-configuring-site-audit',
          },
          { label: 'Semrush pricing', url: 'https://www.semrush.com/pricing/' },
        ],
      },
      'w3c-validator': {
        name: 'W3C Markup Validator',
        url: 'https://validator.w3.org/',
        tagline:
          'A free W3C service that checks the validity of pages’ markup against the specifications.',
        checked: '2026-11-06',
        summary:
          'The W3C validator reads your page’s markup and compares it with the HTML specifications, and its own page says validation is not a full quality check. What we check is different: Arabic text, how it renders, and indexing. You may need both.',
        them: [
          partial(
            'Lists the Arabic encodings iso-8859-6-i and windows-1256 among its character-encoding options; its pages state no checks for letter joining or direction',
          ),
          no(
            'Compares a document’s markup with the specifications; its page describes no page rendering in a browser',
          ),
          no('Outside what its page describes: checking the validity of markup'),
          yes('Checks an address, an uploaded file or pasted text, and its page states no account'),
          yes('A free W3C service per its about page'),
          unknown('Its page does not state interface languages'),
          yes(
            'The HTML5 checker (Nu Html Checker) is open source under the MIT license on GitHub, and its page explains how to run your own copy',
          ),
          no('Outside what its page describes: checking the validity of markup'),
          no('Outside what its page describes: checking the validity of markup'),
          no('Checks one document at a time: an address, a file or text'),
        ],
        pickThem: [
          'You want to be sure your HTML markup is valid against the specifications; we offer no comprehensive check of markup against them.',
          'You want to run the HTML5 checker on your own machine or in continuous integration: its page explains running your own copy.',
        ],
        pickUs: [
          'You want to know whether Arabic letters join and digits and prices are right in Chromium, Firefox and WebKit.',
          'You want indexing, hreflang and AI-readiness checks.',
          'You want advice for your store on Salla, Zid or YouCan.',
        ],
        sources: [
          { label: 'W3C Markup Validation Service: home', url: 'https://validator.w3.org/' },
          {
            label: 'W3C Markup Validation Service: about',
            url: 'https://validator.w3.org/about.html',
          },
          { label: 'Nu Html Checker: about', url: 'https://validator.w3.org/nu/about.html' },
          {
            label: 'Nu Html Checker repository on GitHub (license)',
            url: 'https://github.com/validator/validator',
          },
        ],
      },
    },
  },
}

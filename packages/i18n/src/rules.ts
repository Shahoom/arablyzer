import type { Copy } from './copy'
import { arabicCount, englishCount } from './plural'

/**
 * What a rule reads, on its page: the rendered page, robots.txt, Chrome's data, the server's
 * response (its headers, redirects or connection), or the page.
 */
export type RuleReads = 'html' | 'robots' | 'render' | 'crux' | 'http'

/** The rule library (BUILD-PLAN §6.2, M2.4): its index and each rule's page, around the copy. */
export interface RulesStrings {
  readonly library: {
    readonly meta: { readonly title: string; readonly description: string }
    readonly title: string
    readonly intro: string
    readonly search: string
    readonly searchPlaceholder: string
    readonly categories: string
    readonly count: (count: number) => string
    /** When the search matches no rule. */
    readonly none: string
  }
  readonly page: {
    readonly breadcrumb: string
    /** The chip with the rule's version: «الإصدار 1.0.0». */
    readonly version: string
    readonly reads: Readonly<Record<RuleReads, string>>
    /** A rule that needs a person's review: reported, never deducted. */
    readonly manual: string
    readonly example: string
    readonly wrong: string
    readonly right: string
    readonly weight: {
      readonly title: string
      /** Under the rule's weight: what each severity weighs, from the scoring package. */
      readonly scale: (weights: {
        readonly critical: number
        readonly serious: number
        readonly moderate: number
        readonly minor: number
      }) => string
      /** In place of a weight, for a rule that needs a person's review. */
      readonly manual: string
      readonly methodology: string
    }
    readonly inTools: string
    readonly fullScan: string
    readonly near: string
  }
}

export const RULES_UI: Copy<RulesStrings> = {
  reviewed: false,
  ar: {
    library: {
      meta: {
        title: 'مكتبة قواعد فحص المواقع العربية — Arablyzer',
        description:
          'كل قاعدة يفحصها Arablyzer في صفحة: لماذا تهم، ومثال خطأ وصحيح، وكيف تُصلح، وكيف نكشفها، ووزنها في الدرجة.',
      },
      title: 'مكتبة القواعد',
      intro:
        'كل ما يفحصه Arablyzer قاعدة لها صفحة: لماذا تهم، وكيف تُصلح، وكيف نكشفها بالضبط. كل مخالفة في تقاريرنا تقود إلى قاعدتها هنا.',
      search: 'ابحث في القواعد',
      searchPlaceholder: 'ابحث: خط، اتجاه، robots، hreflang…',
      categories: 'الفئات',
      count: (count) =>
        arabicCount(count, {
          one: 'قاعدة واحدة',
          two: 'قاعدتان',
          few: '{n} قواعد',
          many: '{n} قاعدة',
        }),
      none: 'لا قاعدة بهذا الاسم.',
    },
    page: {
      breadcrumb: 'مسار الصفحة',
      version: 'الإصدار',
      reads: {
        html: 'تقرأ HTML كما يرسله الخادم',
        robots: 'تقرأ robots.txt',
        render: 'تحتاج عرض الصفحة في المتصفح',
        crux: 'تقرأ بيانات زوار Chrome',
        http: 'تقرأ رد الخادم وترويساته',
      },
      manual: 'تحتاج مراجعة بشرية',
      example: 'مثال',
      wrong: 'خطأ',
      right: 'صحيح',
      weight: {
        title: 'وزنها في الدرجة',
        scale: ({ critical, serious, moderate, minor }) =>
          `الحرِجة ${critical}، والخطيرة ${serious}، والمتوسطة ${moderate}، والبسيطة ${minor}، والمعلومة لا تُخصم.`,
        manual: 'لا تُخصم من الدرجة: نذكرها لتراجعها بنفسك.',
        methodology: 'المنهجية',
      },
      inTools: 'تجدها في',
      fullScan: 'الفحص الكامل',
      near: 'قواعد قريبة',
    },
  },
  en: {
    library: {
      meta: {
        title: 'The rule library for Arabic website checks — Arablyzer',
        description:
          'Every rule Arablyzer checks, on a page of its own: why it matters, a wrong and a right example, how to fix it, how we detect it, and its weight in the score.',
      },
      title: 'Rule library',
      intro:
        'Everything Arablyzer checks is a rule with its own page: why it matters, how to fix it, and exactly how we detect it. Every finding in our reports leads to its rule here.',
      search: 'Search the rules',
      searchPlaceholder: 'Search: font, direction, robots, hreflang…',
      categories: 'Categories',
      count: (count) => englishCount(count, 'rule', 'rules'),
      none: 'No rule by that name.',
    },
    page: {
      breadcrumb: 'Breadcrumb',
      version: 'Version',
      reads: {
        html: 'Reads the HTML as the server sends it',
        robots: 'Reads robots.txt',
        render: 'Renders the page in browsers',
        crux: 'Reads Chrome’s visitor data',
        http: 'Reads the server’s response and its headers',
      },
      manual: 'Needs a person’s review',
      example: 'Example',
      wrong: 'Wrong',
      right: 'Right',
      weight: {
        title: 'Its weight in the score',
        scale: ({ critical, serious, moderate, minor }) =>
          `Critical ${critical}, serious ${serious}, moderate ${moderate}, minor ${minor}; information is never deducted.`,
        manual: 'Never deducted from the score: we report it for you to review.',
        methodology: 'Methodology',
      },
      inTools: 'Find it in',
      fullScan: 'The full scan',
      near: 'Related rules',
    },
  },
}

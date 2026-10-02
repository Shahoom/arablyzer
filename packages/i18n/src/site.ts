import type { Copy } from './copy'

/** What every page of the site says: the header and the footer. */
export interface SiteStrings {
  /** BUILD-PLAN §1: «Arablyzer — محلّل المواقع العربية». */
  readonly tagline: string
  /** The logo link's accessible name. */
  readonly homeLink: string
  readonly skipToContent: string
  /** The site's promise in one line: the home page's social card (apps/web/scripts/og-images.ts). */
  readonly statusBar: string
  readonly navLabel: string
  /** The header's sections, each named as its page is built (apps/web, NAV). */
  readonly nav: {
    readonly tools: string
    readonly knowledge: string
    readonly rules: string
    readonly fix: string
  }
  /** The header's call to action, to the scan form: free, and said so. */
  readonly scanCta: string
  /** The link to the same page in the other language, written in that language. */
  readonly otherLang: { readonly label: string; readonly short: string }
  readonly footer: {
    readonly about: string
    /** The footer's links, one landmark. */
    readonly navLabel: string
    /** The footer's columns: the product, its tools, its library, and the project. */
    readonly product: string
    readonly popularTools: string
    /** The library's heading: «تعلّم» / "Learn", as its first link is the hub, «المعرفة». */
    readonly knowledge: string
    readonly aboutHeading: string
    /** The product column's link to the home page's scan form. */
    readonly scan: string
    readonly github: string
    readonly methodology: string
    readonly bot: string
    readonly glossary: string
    readonly license: string
    readonly builtBy: string
    readonly cloudtopia: string
    /** The two lines at the foot, beside the licence. */
    readonly designed: string
    readonly reportsPrivate: string
  }
}

export const SITE: Copy<SiteStrings> = {
  reviewed: false,
  ar: {
    tagline: 'محلّل المواقع العربية',
    homeLink: 'Arablyzer، الصفحة الرئيسية',
    skipToContent: 'انتقل إلى المحتوى',
    statusBar: 'أدوات مجانية وبلا تسجيل · الكود مفتوح المصدر',
    navLabel: 'أقسام الموقع',
    nav: { tools: 'الأدوات', knowledge: 'المعرفة', rules: 'مكتبة القواعد', fix: 'أدلة الإصلاح' },
    scanCta: 'افحص مجاناً',
    otherLang: { label: 'English', short: 'EN' },
    footer: {
      about: 'محلّل المواقع العربية: أدوات مجانية تفحص ما يراه الزبون العربي فعلاً.',
      navLabel: 'روابط أسفل الصفحة',
      product: 'المنتج',
      popularTools: 'أدوات شائعة',
      knowledge: 'تعلّم',
      aboutHeading: 'عن Arablyzer',
      scan: 'الفحص',
      github: 'الكود على GitHub',
      methodology: 'المنهجية',
      bot: 'ArablyzerBot وكيف تمنعه',
      glossary: 'المسرد',
      license: 'مفتوح المصدر بترخيص AGPL-3.0',
      builtBy: 'بناه',
      cloudtopia: 'كلاود توبيا',
      designed: 'صُمّم للعربية أولاً.',
      reportsPrivate: 'التقارير لا تظهر في محركات البحث.',
    },
  },
  en: {
    tagline: 'Arabic website analyzer',
    homeLink: 'Arablyzer, home',
    skipToContent: 'Skip to content',
    statusBar: 'Free tools, no sign-up · Open source',
    navLabel: 'Site sections',
    nav: { tools: 'Tools', knowledge: 'Knowledge', rules: 'Rule library', fix: 'Fix guides' },
    scanCta: 'Scan free',
    otherLang: { label: 'العربية', short: 'العربية' },
    footer: {
      about:
        'The Arabic website analyzer: free tools that check what Arabic-speaking customers actually see.',
      navLabel: 'Footer links',
      product: 'Product',
      popularTools: 'Popular tools',
      knowledge: 'Learn',
      aboutHeading: 'About Arablyzer',
      scan: 'Scan',
      github: 'The code on GitHub',
      methodology: 'Methodology',
      bot: 'ArablyzerBot, and how to block it',
      glossary: 'Glossary',
      license: 'Open source under AGPL-3.0',
      builtBy: 'Built by',
      cloudtopia: 'CloudTopia',
      designed: 'Designed for Arabic first.',
      reportsPrivate: 'Reports never appear in search engines.',
    },
  },
}

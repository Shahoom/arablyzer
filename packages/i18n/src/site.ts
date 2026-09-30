import type { Copy } from './copy'

/** What every page of the site says: the status bar, the header and the footer. */
export interface SiteStrings {
  /** BUILD-PLAN §1: «Arablyzer — محلّل المواقع العربية». */
  readonly tagline: string
  /** The logo link's accessible name. */
  readonly homeLink: string
  readonly skipToContent: string
  readonly statusBar: string
  readonly navLabel: string
  /** The header's call to action, to the scan form. */
  readonly scanCta: string
  /** The link to the same page in the other language, written in that language. */
  readonly otherLang: { readonly label: string; readonly short: string }
  readonly footer: {
    readonly about: string
    readonly project: string
    readonly github: string
    readonly license: string
    readonly builtBy: string
    readonly cloudtopia: string
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
    scanCta: 'افحص موقعك',
    otherLang: { label: 'English', short: 'EN' },
    footer: {
      about: 'محلّل المواقع العربية: أدوات مجانية تفحص ما يراه الزبون العربي فعلاً.',
      project: 'المشروع',
      github: 'الكود على GitHub',
      license: 'مفتوح المصدر بترخيص AGPL-3.0',
      builtBy: 'بناه',
      cloudtopia: 'كلاود توبيا',
    },
  },
  en: {
    tagline: 'Arabic website analyzer',
    homeLink: 'Arablyzer, home',
    skipToContent: 'Skip to content',
    statusBar: 'Free tools, no sign-up · Open source',
    navLabel: 'Site sections',
    scanCta: 'Check your site',
    otherLang: { label: 'العربية', short: 'العربية' },
    footer: {
      about:
        'The Arabic website analyzer: free tools that check what Arabic-speaking customers actually see.',
      project: 'Project',
      github: 'The code on GitHub',
      license: 'Open source under AGPL-3.0',
      builtBy: 'Built by',
      cloudtopia: 'CloudTopia',
    },
  },
}

import type { Copy } from './copy'

/** The /fix guides and the glossary (M2.4d), around each page's own copy. */
export interface GuidesStrings {
  readonly fix: {
    readonly meta: { readonly title: string; readonly description: string }
    readonly title: string
    readonly intro: string
    readonly breadcrumb: string
    /** Where the messages come from, above each guide's title. */
    readonly source: string
    readonly groups: { readonly 'not-indexed': string; readonly warning: string }
    /** The message in the other language, for people whose Search Console is in it. */
    readonly otherMessage: string
    readonly contents: string
    readonly tools: string
    readonly rules: string
    readonly related: string
    readonly updated: string
  }
  readonly glossary: {
    readonly meta: { readonly title: string; readonly description: string }
    readonly title: string
    readonly intro: string
    readonly breadcrumb: string
    /** The term as developers write it, beside its Arabic name. */
    readonly term: string
    readonly contents: string
    readonly tools: string
    readonly rules: string
    readonly guides: string
    readonly related: string
    readonly updated: string
  }
}

export const GUIDES_UI: Copy<GuidesStrings> = {
  reviewed: false,
  ar: {
    fix: {
      meta: {
        title: 'أدلة إصلاح رسائل Search Console بالعربية — Arablyzer',
        description:
          'دليل بالعربية لكل رسالة في تقرير فهرسة الصفحات في Google Search Console: ماذا تعني، ولماذا تظهر، وكيف تُصلحها وتتحقق من الإصلاح.',
      },
      title: 'أدلة الإصلاح',
      intro:
        'لكل رسالة في تقرير فهرسة الصفحات في Search Console دليل: ماذا تعني، ولماذا تظهر، وكيف تُصلحها، وكيف تتحقق من أن الإصلاح نجح.',
      breadcrumb: 'مسار الصفحة',
      source: 'تقرير فهرسة الصفحات في Search Console',
      groups: { 'not-indexed': 'صفحات لم تتم فهرستها', warning: 'صفحات مفهرسة مع تحذير' },
      otherMessage: 'الرسالة كما تظهر بالإنجليزية',
      contents: 'في هذه الصفحة',
      tools: 'أدوات تفحصها',
      rules: 'القواعد',
      related: 'رسائل قريبة',
      updated: 'آخر تحديث',
    },
    glossary: {
      meta: {
        title: 'مسرد مصطلحات SEO والويب بالعربية — Arablyzer',
        description:
          'مصطلحات تحسين محركات البحث والويب والنص العربي، بالعربية: كل مصطلح في صفحة، بتعريفه، ولماذا يهم، ومثال، والأخطاء الشائعة.',
      },
      title: 'المسرد',
      intro:
        'مصطلحات تحسين محركات البحث والويب والنص العربي، كل مصطلح في صفحة: تعريفه، ولماذا يهم موقعك، ومثال عليه.',
      breadcrumb: 'مسار الصفحة',
      term: 'بالإنجليزية',
      contents: 'في هذه الصفحة',
      tools: 'أدوات تفحصه',
      rules: 'القواعد',
      guides: 'أدلة الإصلاح',
      related: 'مصطلحات قريبة',
      updated: 'آخر تحديث',
    },
  },
  en: {
    fix: {
      meta: {
        title: 'Search Console message fix guides — Arablyzer',
        description:
          "A guide for each message of Google Search Console's Page indexing report: what it means, why it shows, how to fix it and how to check the fix.",
      },
      title: 'Fix guides',
      intro:
        "A guide for each message of Search Console's Page indexing report: what it means, why it shows, how to fix it, and how to check that the fix worked.",
      breadcrumb: 'Breadcrumb',
      source: "Search Console's Page indexing report",
      groups: { 'not-indexed': 'Pages not indexed', warning: 'Indexed, with a warning' },
      otherMessage: 'The message as it shows in Arabic',
      contents: 'On this page',
      tools: 'Tools that check it',
      rules: 'Rules',
      related: 'Related messages',
      updated: 'Last updated',
    },
    glossary: {
      meta: {
        title: 'Glossary of SEO and web terms — Arablyzer',
        description:
          'Terms of SEO, the web and Arabic text, each on a page: its definition, why it matters, an example, and the usual mistakes.',
      },
      title: 'Glossary',
      intro:
        'Terms of SEO, the web and Arabic text, each on a page: what it is, why it matters for your site, and an example.',
      breadcrumb: 'Breadcrumb',
      term: 'In Arabic',
      contents: 'On this page',
      tools: 'Tools that check it',
      rules: 'Rules',
      guides: 'Fix guides',
      related: 'Related terms',
      updated: 'Last updated',
    },
  },
}

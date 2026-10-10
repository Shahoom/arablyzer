import type { Copy } from './copy'
import { arabicCount, englishCount, type ArabicForms } from './plural'

/**
 * The blog («المقالات»): its index, its tag pages and its articles' furniture. The articles'
 * own words are Markdown in apps/web/src/content/blog, each with its own `reviewed` flag; what
 * is here is the interface around them, and the tags (a tag's name and the sentence under it).
 */

/** The topics an article may carry: `tags` in an article's frontmatter names these slugs. */
export const BLOG_TAGS = ['arabic-text', 'fonts', 'performance', 'search', 'ecommerce'] as const
export type BlogTag = (typeof BLOG_TAGS)[number]

export interface BlogStrings {
  readonly meta: { readonly title: string; readonly description: string }
  readonly title: string
  readonly lead: string
  /** The trail's landmark name. */
  readonly breadcrumb: string
  /** The row of tags above the list: its accessible name, and its first chip. */
  readonly tagsLabel: string
  readonly allArticles: string
  /** What the list says it holds: «8 مقالات». */
  readonly count: (count: number) => string
  /** The tag's name in a chip, a row and a heading; and the sentence under a tag page's heading. */
  readonly tags: Readonly<Record<BlogTag, { readonly name: string; readonly description: string }>>
  /** A tag's page: its title and meta description, from the tag's name. */
  readonly tagPage: {
    readonly title: (name: string) => string
    readonly description: (name: string, count: number) => string
  }
  /** The English index says why it lists few articles. */
  readonly translationNote: string
  readonly article: {
    readonly by: string
    readonly published: string
    readonly updated: string
    /** «قراءة في 7 دقائق». */
    readonly readingTime: (minutes: number) => string
    readonly contents: string
    readonly related: string
    readonly tools: string
    readonly rules: string
    readonly guides: string
    readonly terms: string
    readonly next: string
    readonly previous: string
    /** The pager's landmark name. */
    readonly pager: string
    /** A link to the same article in the other language, when it has one. */
    readonly otherLanguage: string
    /** Shown on the author's line under the title: the team, not a person. */
    readonly defaultAuthor: string
    /** The index's newest article, set apart above the list. */
    readonly latest: string
    /** The close of an article: one line and a button to the scan, on the home page. */
    readonly tryIt: { readonly title: string; readonly text: string; readonly button: string }
  }
  readonly feeds: {
    readonly rss: string
    readonly atom: string
    /** The `title` of the feed's `<link>`. */
    readonly rssTitle: string
    readonly atomTitle: string
    readonly label: string
  }
  /** Blocks that other pages show about the articles that mention them. */
  readonly relatedArticles: { readonly title: string }
}

const MINUTES: ArabicForms = {
  one: 'دقيقة واحدة',
  two: 'دقيقتين',
  few: '{n} دقائق',
  many: '{n} دقيقة',
}
const ARTICLES: ArabicForms = {
  one: 'مقال واحد',
  two: 'مقالان',
  few: '{n} مقالات',
  many: '{n} مقالاً',
  other: '{n} مقال',
}

export const BLOG_UI: Copy<BlogStrings> = {
  reviewed: false,
  ar: {
    meta: {
      title: 'المقالات: السيو والأداء والنص العربي، من واقع ما نقيسه',
      description:
        'مقالات عملية عن ظهور المواقع العربية في Google: الحروف المقطّعة، رمز الريال الجديد، سرعة الخطوط، hreflang وفهرسة المتاجر. مبنية على ما تقيسه أدوات Arablyzer فعلاً.',
    },
    title: 'المقالات',
    lead: 'ما نتعلمه من فحص المواقع العربية: أعطال الحروف والخطوط، والفهرسة، والسرعة، وما تراه أدوات البحث والذكاء الاصطناعي في نصك.',
    breadcrumb: 'مسار الصفحة',
    tagsLabel: 'المواضيع',
    allArticles: 'كل المقالات',
    count: (count) => arabicCount(count, ARTICLES),
    tags: {
      'arabic-text': {
        name: 'النص العربي',
        description:
          'كيف يُكتب النص العربي ويُرسم ويُقرأ: الحروف المتصلة، الأرقام، وما تفهمه الآلة منه.',
      },
      fonts: {
        name: 'الخطوط',
        description: 'خطوط الويب العربية: ما تغطيه من حروف، وكم تثقل الصفحة، ولماذا تتقطع الحروف.',
      },
      performance: {
        name: 'الأداء',
        description: 'سرعة الصفحة ومؤشرات Core Web Vitals، وما يبطئ المواقع العربية تحديداً.',
      },
      search: {
        name: 'البحث والفهرسة',
        description:
          'ظهور الصفحات في Google ومحركات البحث والذكاء الاصطناعي: الفهرسة، hreflang، والأخطاء الشائعة.',
      },
      ecommerce: {
        name: 'المتاجر',
        description:
          'ما يخص المتاجر الإلكترونية العربية: سلة وزد، الأسعار والعملات، وسرعة صفحات المنتجات.',
      },
    },
    tagPage: {
      title: (name) => `مقالات عن ${name}`,
      description: (name, count) =>
        `${arabicCount(count, ARTICLES)} عن ${name}، من واقع ما تقيسه أدوات Arablyzer على المواقع العربية.`,
    },
    translationNote: 'نكتب المقالات بالعربية أولاً.',
    article: {
      by: 'بقلم',
      published: 'نُشر',
      updated: 'حُدّث',
      readingTime: (minutes) => `قراءة في ${arabicCount(minutes, MINUTES)}`,
      contents: 'في هذا المقال',
      related: 'مقالات ذات صلة',
      tools: 'أدوات تفحص هذا',
      rules: 'القواعد',
      guides: 'أدلة الإصلاح',
      terms: 'من المسرد',
      next: 'المقال التالي',
      previous: 'المقال السابق',
      pager: 'التنقل بين المقالات',
      otherLanguage: 'اقرأ المقال بالإنجليزية',
      defaultAuthor: 'فريق Arablyzer',
      latest: 'الأحدث',
      tryIt: {
        title: 'جرّبه على موقعك',
        text: 'ألصق رابط موقعك: نفتحه في ثلاثة متصفحات ونقول لك ما ينكسر فيه.',
        button: 'افحص موقعي',
      },
    },
    feeds: {
      rss: 'RSS',
      atom: 'Atom',
      rssTitle: 'مقالات Arablyzer (RSS)',
      atomTitle: 'مقالات Arablyzer (Atom)',
      label: 'اشترك في المقالات',
    },
    relatedArticles: { title: 'مقالات عن هذا' },
  },
  en: {
    meta: {
      title: 'Articles: SEO, performance and Arabic text, from what we measure',
      description:
        'Practical articles on how Arabic websites show up in Google: broken letters, the new riyal sign, font weight, hreflang and indexing. Built on what the Arablyzer tools actually measure.',
    },
    title: 'Articles',
    lead: 'What we learn from scanning Arabic websites: broken letters and fonts, indexing, speed, and what search engines and AI see in your text.',
    breadcrumb: 'Breadcrumb',
    tagsLabel: 'Topics',
    allArticles: 'All articles',
    count: (count) => englishCount(count, 'article', 'articles'),
    tags: {
      'arabic-text': {
        name: 'Arabic text',
        description:
          'How Arabic text is written, drawn and read: joined letters, digits, and what machines make of it.',
      },
      fonts: {
        name: 'Fonts',
        description:
          'Arabic web fonts: which letters they cover, how much weight they add, and why letters break apart.',
      },
      performance: {
        name: 'Performance',
        description:
          'Page speed and Core Web Vitals, and what slows Arabic websites in particular.',
      },
      search: {
        name: 'Search and indexing',
        description:
          'How pages appear in Google, other search engines and AI assistants: indexing, hreflang and common mistakes.',
      },
      ecommerce: {
        name: 'Online stores',
        description:
          'What matters to Arabic online stores: Salla and Zid, prices and currencies, product-page speed.',
      },
    },
    tagPage: {
      title: (name) => `Articles on ${name}`,
      description: (name, count) =>
        `${englishCount(count, 'article', 'articles')} on ${name}, from what the Arablyzer tools measure on Arabic websites.`,
    },
    translationNote:
      'Articles are written in Arabic first. These are the ones translated into English.',
    article: {
      by: 'By',
      published: 'Published',
      updated: 'Updated',
      readingTime: (minutes) => `${englishCount(minutes, 'minute', 'minutes')} to read`,
      contents: 'In this article',
      related: 'Related articles',
      tools: 'Tools that check this',
      rules: 'Rules',
      guides: 'Fix guides',
      terms: 'From the glossary',
      next: 'Next article',
      previous: 'Previous article',
      pager: 'More articles',
      otherLanguage: 'Read this article in Arabic',
      defaultAuthor: 'The Arablyzer team',
      latest: 'Latest',
      tryIt: {
        title: 'Try it on your site',
        text: 'Paste your address. We open it in three browsers and tell you what breaks.',
        button: 'Scan my site',
      },
    },
    feeds: {
      rss: 'RSS',
      atom: 'Atom',
      rssTitle: 'Arablyzer articles (RSS)',
      atomTitle: 'Arablyzer articles (Atom)',
      label: 'Subscribe',
    },
    relatedArticles: { title: 'Articles on this' },
  },
}

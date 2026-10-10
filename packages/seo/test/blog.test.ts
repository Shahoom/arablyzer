import { describe, expect, it } from 'vitest'
import {
  alternates,
  applicationList,
  atomXml,
  blogPosting,
  countWords,
  defineSite,
  faqPage,
  htmlToText,
  llmsTxt,
  organization,
  parseFrontmatter,
  readingMinutes,
  renderArticle,
  renderHead,
  rssXml,
  sitemapXml,
  softwareApplication,
  webSite,
  type Feed,
} from '../src/index'
import { rfc3339, rfc822 } from '../src/feed'
import { SITEMAP_SECTIONS } from '../src/sitemap'

const SITE = defineSite('https://arablyzer.example')

describe('renderArticle', () => {
  const body = [
    'مقدمة المقال.',
    '',
    '## القسم الأول {#first}',
    '',
    'نص القسم مع `code` وروابط [أداة](/tools/rtl-check).',
    '',
    '### عنوان فرعي {#sub}',
    '',
    '- نقطة أولى',
    '- نقطة ثانية',
    '',
    '```css',
    '## not a heading {#x}',
    '```',
    '',
    '## القسم الثاني {#second}',
    '',
    'نص ثانٍ.',
  ].join('\n')

  it('splits an introduction and sections by their headings, with the ids the author wrote', () => {
    const article = renderArticle(body)
    expect(article.intro).toBe('<p>مقدمة المقال.</p>')
    expect(article.sections.map((section) => [section.id, section.title])).toEqual([
      ['first', 'القسم الأول'],
      ['second', 'القسم الثاني'],
    ])
    expect(article.sections[0]?.html).toContain('<h3 id="sub">عنوان فرعي</h3>')
    expect(article.sections[0]?.html).toContain('<a href="/tools/rtl-check">أداة</a>')
    // A line inside a code block is code, whatever it starts with.
    expect(article.sections[0]?.html).toContain('## not a heading {#x}')
  })

  it('refuses a heading without an id, a repeated id, a lone h3, and an unclosed block', () => {
    expect(() => renderArticle('## بلا معرّف')).toThrow(/with an id/)
    expect(() => renderArticle('# عنوان رئيسي {#h1}')).toThrow(/with an id/)
    expect(() => renderArticle('## أ {#a}\n\nنص\n\n## ب {#a}')).toThrow(/same id|id a/)
    expect(() => renderArticle('### فرعي {#a}')).toThrow(/needs a ##/)
    expect(() => renderArticle('## أ {#a}\n\n```css\nbody {}')).toThrow(/not closed/)
  })

  it('counts the words of the prose, not the code or the marks of the Markdown', () => {
    const text =
      '## عنوان قصير {#a}\n\nكلمة **غامقة** و[رابط](/x) هنا.\n\n```css\na b c d e f\n```\n\n- نقطة واحدة'
    expect(countWords(text)).toBe(2 + 4 + 2)
    expect(readingMinutes(0)).toBe(1)
    expect(readingMinutes(200)).toBe(1)
    expect(readingMinutes(201)).toBe(2)
    expect(readingMinutes(1000)).toBe(5)
  })
})

describe('parseFrontmatter', () => {
  it('reads the YAML subset the articles use', () => {
    const { data, body } = parseFrontmatter(
      [
        '---',
        'title: "عنوان: مع نقطتين"',
        "description: 'it''s'",
        'draft: false',
        'reviewed: true',
        'lang: ar',
        'tags: ["a", "b, c"]',
        'tools: []',
        '---',
        'النص',
      ].join('\n'),
    )
    expect(data.title).toBe('عنوان: مع نقطتين')
    expect(data.draft).toBe(false)
    expect(data.reviewed).toBe(true)
    expect(data.lang).toBe('ar')
    expect(data.tags).toEqual(['a', 'b, c'])
    expect(data.tools).toEqual([])
    expect(body).toBe('النص')
    expect(() => parseFrontmatter('no frontmatter')).toThrow(/---/)
    expect(() => parseFrontmatter('---\nnot a pair\n---\n')).toThrow(/key: value/)
  })
})

describe('feeds', () => {
  const feed: Feed = {
    title: 'مقالات & أخرى',
    description: 'وصف "المدونة"',
    lang: 'ar',
    siteUrl: 'https://arablyzer.example/blog',
    feedUrl: 'https://arablyzer.example/blog/feed.xml',
    entries: [
      {
        title: 'أول <مقال>',
        url: 'https://arablyzer.example/blog/first',
        summary: 'ملخص',
        published: '2026-10-10',
        updated: '2026-10-12',
        tags: ['الخطوط'],
        author: 'فريق Arablyzer',
      },
      {
        title: 'ثانٍ',
        url: 'https://arablyzer.example/blog/second',
        summary: 'ملخص ثانٍ',
        published: '2026-09-01',
        updated: '2026-09-01',
        tags: [],
        author: 'فريق Arablyzer',
      },
    ],
  }

  it('writes dates RFC 822 for RSS and RFC 3339 for Atom, from the articles’ own days', () => {
    expect(rfc822('2026-10-10')).toBe('Sat, 10 Oct 2026 00:00:00 GMT')
    expect(rfc822('2026-01-05')).toBe('Mon, 05 Jan 2026 00:00:00 GMT')
    expect(rfc3339('2026-10-10')).toBe('2026-10-10T00:00:00Z')
    expect(() => rfc3339('10/10/2026')).toThrow(/YYYY-MM-DD/)
    expect(() => rfc822('2026-02-30')).toThrow(/YYYY-MM-DD/)
  })

  it('writes an RSS 2.0 feed whose items are the entries, escaped, with the newest date as its own', () => {
    const xml = rssXml(feed)
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<rss version="2.0"')
    expect(xml).toContain('<title>مقالات &amp; أخرى</title>')
    expect(xml).toContain('<title>أول &lt;مقال&gt;</title>')
    expect(xml).toContain('<language>ar</language>')
    expect(xml).toContain('<lastBuildDate>Mon, 12 Oct 2026 00:00:00 GMT</lastBuildDate>')
    expect(xml).toContain('<guid isPermaLink="true">https://arablyzer.example/blog/first</guid>')
    expect(xml).toContain('<pubDate>Sat, 10 Oct 2026 00:00:00 GMT</pubDate>')
    expect(xml).toContain('<atom:link href="https://arablyzer.example/blog/feed.xml" rel="self"')
    expect(xml.match(/<item>/g)).toHaveLength(2)
    expect(xml.match(/<category>/g)).toHaveLength(1)
  })

  it('writes an Atom feed with a self link, ids, both dates and authors', () => {
    const xml = atomXml(feed)
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ar">')
    expect(xml).toContain('<updated>2026-10-12T00:00:00Z</updated>')
    expect(xml).toContain('<link rel="self" type="application/atom+xml"')
    expect(xml).toContain('<id>https://arablyzer.example/blog/second</id>')
    expect(xml).toContain('<published>2026-10-10T00:00:00Z</published>')
    expect(xml).toContain('<author><name>فريق Arablyzer</name></author>')
    expect(xml.match(/<entry>/g)).toHaveLength(2)
  })

  it('is valid for a blog with no articles yet', () => {
    const empty = { ...feed, entries: [] }
    expect(rssXml(empty)).not.toContain('lastBuildDate')
    expect(atomXml(empty)).toContain('<updated>1970-01-01T00:00:00Z</updated>')
  })
})

describe('llmsTxt', () => {
  it('writes the name, the summary, the details and sections of links', () => {
    const text = llmsTxt({
      name: 'Arablyzer',
      summary: 'A free analyzer for Arabic websites.',
      details: ['It runs tools.'],
      sections: [
        {
          title: 'Articles [ar]',
          links: [
            { title: 'مقال [1]', url: 'https://arablyzer.example/blog/a', note: 'وصف' },
            { title: 'Plain', url: 'https://arablyzer.example/blog/b' },
          ],
        },
        { title: 'Empty', links: [] },
      ],
    })
    expect(text).toBe(
      [
        '# Arablyzer',
        '',
        '> A free analyzer for Arabic websites.',
        '',
        'It runs tools.',
        '',
        '## Articles ar',
        '',
        '- [مقال 1](https://arablyzer.example/blog/a): وصف',
        '- [Plain](https://arablyzer.example/blog/b)',
        '',
      ].join('\n'),
    )
  })

  it('refuses a link that is not https, or has a space', () => {
    const one = (url: string) =>
      llmsTxt({
        name: 'A',
        summary: 'S',
        details: [],
        sections: [{ title: 'T', links: [{ title: 'x', url }] }],
      })
    expect(() => one('http://arablyzer.example/')).toThrow(/https/)
    expect(() => one('https://arablyzer.example/a b')).toThrow(/https/)
    expect(() => llmsTxt({ name: 'A', summary: 'two\nlines', details: [], sections: [] })).toThrow(
      /one line/,
    )
  })
})

describe('the JSON-LD of the site and its articles', () => {
  it('describes the publisher once, by an @id the other nodes point to', () => {
    const org = organization({
      name: 'Arablyzer',
      url: 'https://arablyzer.example/',
      origin: SITE.origin,
      logo: 'https://arablyzer.example/favicon.svg',
      parent: { name: 'CloudTopia', url: 'https://cloudtopia.net' },
    })
    expect(org).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': 'https://arablyzer.example/#organization',
      parentOrganization: { '@type': 'Organization', name: 'CloudTopia' },
    })
    const site = webSite({
      name: 'Arablyzer',
      url: 'https://arablyzer.example/',
      origin: SITE.origin,
      lang: 'ar',
      description: 'd',
      searchUrl: 'https://arablyzer.example/knowledge?q={search_term_string}',
    })
    expect(site).toMatchObject({
      '@type': 'WebSite',
      publisher: { '@id': 'https://arablyzer.example/#organization' },
      potentialAction: {
        '@type': 'SearchAction',
        target: { urlTemplate: 'https://arablyzer.example/knowledge?q={search_term_string}' },
        'query-input': 'required name=search_term_string',
      },
    })
    expect(
      webSite({
        name: 'A',
        url: 'https://arablyzer.example/',
        origin: SITE.origin,
        lang: 'en',
        description: 'd',
      }),
    ).not.toHaveProperty('potentialAction')
    expect(() =>
      webSite({
        name: 'A',
        url: 'https://arablyzer.example/',
        origin: SITE.origin,
        lang: 'en',
        description: 'd',
        searchUrl: 'https://arablyzer.example/knowledge?q=x',
      }),
    ).toThrow(/search_term_string/)
  })

  it('describes the product as free, with no invented rating', () => {
    const app = softwareApplication({
      name: 'Arablyzer',
      description: 'd',
      url: 'https://arablyzer.example/',
      origin: SITE.origin,
      lang: 'ar',
    })
    expect(app).toMatchObject({
      '@type': 'SoftwareApplication',
      isAccessibleForFree: true,
      offers: { price: 0 },
    })
    expect(app).not.toHaveProperty('aggregateRating')
  })

  it('writes a FAQPage from the questions and answers a page shows, as plain text', () => {
    const faq = faqPage([
      {
        question: 'ما <code dir="ltr">robots.txt</code>؟',
        answer: '<p>ملف &amp; نص.</p><ul><li>أ</li><li>ب</li></ul>',
      },
    ])
    expect(faq).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'ما robots.txt؟',
          acceptedAnswer: { '@type': 'Answer', text: 'ملف & نص. أ ب' },
        },
      ],
    })
    expect(() => faqPage([])).toThrow(/at least one/)
    expect(htmlToText('<p>a &lt;b&gt;</p>')).toBe('a <b>')
  })

  it('writes a BlogPosting with its author, publisher, dates and image', () => {
    const post = blogPosting({
      headline: 'لماذا تتقطع الحروف؟',
      description: 'وصف',
      url: 'https://arablyzer.example/blog/x',
      origin: SITE.origin,
      lang: 'ar',
      published: '2026-10-10',
      modified: '2026-10-11',
      author: 'فريق Arablyzer',
      image: 'https://arablyzer.example/og/blog/x.png',
      keywords: ['الخطوط', 'النص العربي'],
      wordCount: 1000,
    })
    expect(post).toMatchObject({
      '@type': 'BlogPosting',
      inLanguage: 'ar',
      datePublished: '2026-10-10',
      dateModified: '2026-10-11',
      author: { '@type': 'Organization', name: 'فريق Arablyzer' },
      publisher: { '@id': 'https://arablyzer.example/#organization' },
      image: ['https://arablyzer.example/og/blog/x.png'],
      keywords: 'الخطوط, النص العربي',
      wordCount: 1000,
      mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://arablyzer.example/blog/x' },
    })
  })

  it('lists two applications side by side, with an offer only where the price is known', () => {
    const list = applicationList([
      { name: 'Arablyzer', url: 'https://arablyzer.example/', description: 'a', free: true },
      { name: 'Other', url: 'https://other.example/', description: 'b' },
    ]) as { itemListElement: { position: number; item: Record<string, unknown> }[] }
    expect(list.itemListElement.map((entry) => entry.position)).toEqual([1, 2])
    expect(list.itemListElement[0]?.item).toHaveProperty('offers')
    expect(list.itemListElement[1]?.item).not.toHaveProperty('offers')
  })
})

describe('renderHead for an article and its feeds', () => {
  it('writes og:type article with its dates and tags, and a link for each feed', () => {
    const head = renderHead({
      title: 'T',
      openGraph: {
        type: 'article',
        title: 'T',
        description: 'D',
        article: { published: '2026-10-10', modified: '2026-10-11', tags: ['الخطوط'] },
      },
      feeds: [
        { kind: 'rss', title: 'RSS "ar"', href: 'https://arablyzer.example/blog/feed.xml' },
        { kind: 'atom', title: 'Atom', href: 'https://arablyzer.example/blog/atom.xml' },
      ],
    })
    expect(head).toContain('<meta property="og:type" content="article">')
    expect(head).toContain('<meta property="article:published_time" content="2026-10-10">')
    expect(head).toContain('<meta property="article:modified_time" content="2026-10-11">')
    expect(head).toContain('<meta property="article:tag" content="الخطوط">')
    expect(head).toContain(
      '<link rel="alternate" type="application/rss+xml" title="RSS &quot;ar&quot;" href="https://arablyzer.example/blog/feed.xml">',
    )
    expect(head).toContain('type="application/atom+xml"')
    expect(renderHead({ title: 'T', openGraph: { title: 'T', description: 'D' } })).toContain(
      'og:type" content="website"',
    )
  })
})

describe('hreflang for a page in one language, and the blog’s sitemap', () => {
  it('names only the languages the page is in, with x-default the first of them', () => {
    expect(alternates(SITE, '/blog/x', ['ar'])).toEqual([
      { hreflang: 'ar', href: 'https://arablyzer.example/blog/x' },
      { hreflang: 'x-default', href: 'https://arablyzer.example/blog/x' },
    ])
    expect(alternates(SITE, '/blog/x', ['en'])[1]).toEqual({
      hreflang: 'x-default',
      href: 'https://arablyzer.example/en/blog/x',
    })
    expect(alternates(SITE, '/blog/x')).toHaveLength(3)
    expect(() => alternates(SITE, '/blog/x', [])).toThrow(TypeError)
  })

  it('lists an article with no translation once, and one with a translation twice', () => {
    const xml = sitemapXml(SITE, [
      { path: '/blog/only-arabic', lastmod: '2026-10-10', langs: ['ar'] },
      { path: '/blog/both', lastmod: '2026-10-11' },
    ])
    expect(xml.match(/<url>/g)).toHaveLength(3)
    expect(xml).toContain('<loc>https://arablyzer.example/blog/only-arabic</loc>')
    expect(xml).not.toContain('/en/blog/only-arabic')
    expect(xml).toContain('<loc>https://arablyzer.example/en/blog/both</loc>')
    expect(xml.match(/hreflang="en"/g)).toHaveLength(2)
  })

  it('has a section for the blog and one for the comparisons', () => {
    expect(SITEMAP_SECTIONS).toEqual(
      expect.arrayContaining(['pages', 'tools', 'rules', 'fix', 'glossary', 'blog', 'compare']),
    )
  })
})

import { readdirSync, readFileSync } from 'node:fs'
import { BLOG_TAGS } from '@arablyzer/i18n'
import { countWords, parseFrontmatter, renderArticle } from '@arablyzer/seo/article'
import { describe, expect, it } from 'vitest'
import { pendingReview } from '../scripts/check-blog-review'
import { blogSchema, isSlug, type BlogFrontmatter } from '../src/lib/blog-schema'
import { GUIDES_DATA } from '../src/lib/guide-data'
import { LIBRARY_DATA } from '../src/lib/rule-data'
import { TOOLS_DATA } from '../src/lib/tool-data'

// The blog's articles (M6), read as files, without Astro: the frontmatter against the schema the
// build uses, the length and the links of each article, and the Arabic rules the site's own scan
// would apply to it (a defect shown as an example goes in a code span, which the rules skip).

const ROOT = new URL('../src/content/blog/', import.meta.url)

interface Article {
  readonly dir: string
  readonly slug: string
  readonly data: BlogFrontmatter
  readonly body: string
}

const articles: Article[] = readdirSync(ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((dir) =>
    readdirSync(new URL(`${dir.name}/`, ROOT))
      .filter((file) => file.endsWith('.md'))
      .map((file) => {
        const { data, body } = parseFrontmatter(
          readFileSync(new URL(`${dir.name}/${file}`, ROOT), 'utf8'),
        )
        const checked = blogSchema.safeParse(data)
        if (!checked.success) {
          throw new Error(`${dir.name}/${file}: ${JSON.stringify(checked.error.issues)}`)
        }
        return { dir: dir.name, slug: file.slice(0, -'.md'.length), data: checked.data, body }
      }),
  )
const ar = articles.filter((article) => article.dir === 'ar')
const en = articles.filter((article) => article.dir === 'en')

/** The pages an article may link to, by their path, in the language of the article. */
function knownPaths(): Set<string> {
  const paths = new Set<string>([
    '/knowledge',
    '/tools',
    '/rules',
    '/fix',
    '/glossary',
    '/methodology',
    '/blog',
  ])
  for (const tool of TOOLS_DATA.tools) paths.add(`/tools/${tool.slug}`)
  for (const rule of LIBRARY_DATA.rules) paths.add(`/rules/${rule.id}`)
  for (const guide of GUIDES_DATA.fix) paths.add(`/fix/${guide.slug}`)
  for (const term of GUIDES_DATA.glossary) paths.add(`/glossary/${term.slug}`)
  return paths
}

/** The text a rule of the site reads: the body without code blocks and code spans. */
function prose(body: string): string {
  return body.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '')
}

describe('the articles', () => {
  it('are Arabic first: eight in Arabic, and English ones only for an Arabic one', () => {
    expect(ar.length).toBeGreaterThanOrEqual(8)
    expect(en.length).toBeGreaterThanOrEqual(2)
    for (const article of en) {
      expect(ar.map((one) => one.slug)).toContain(article.slug)
    }
  })

  it.each(articles.map((article) => [`${article.dir}/${article.slug}`, article] as const))(
    '%s has a valid frontmatter, in its own folder',
    (_name, article) => {
      expect(article.data.lang).toBe(article.dir)
      expect(isSlug(article.slug)).toBe(true)
      expect(article.data.title).not.toBe(article.data.description)
      for (const tag of article.data.tags) expect(BLOG_TAGS).toContain(tag)
    },
  )

  it.each(articles.map((article) => [`${article.dir}/${article.slug}`, article] as const))(
    '%s is 900 to 1,500 words, in sections with ids',
    (_name, article) => {
      const words = countWords(article.body)
      expect(words).toBeGreaterThanOrEqual(900)
      expect(words).toBeLessThanOrEqual(1500)
      const rendered = renderArticle(article.body)
      expect(rendered.sections.length).toBeGreaterThanOrEqual(4)
      expect(rendered.words).toBe(words)
    },
  )

  it.each(articles.map((article) => [`${article.dir}/${article.slug}`, article] as const))(
    '%s names only tools, rules, guides, terms and articles that exist',
    (_name, article) => {
      const { data } = article
      const tools = new Set(TOOLS_DATA.tools.map((tool) => tool.slug))
      const rules = new Set(LIBRARY_DATA.rules.map((rule) => rule.id))
      const fix = new Set(GUIDES_DATA.fix.map((guide) => guide.slug))
      const terms = new Set(GUIDES_DATA.glossary.map((term) => term.slug))
      const same = new Set(articles.filter((one) => one.dir === article.dir).map((one) => one.slug))
      expect(data.tools.filter((slug) => !tools.has(slug))).toEqual([])
      expect(data.rules.filter((id) => !rules.has(id))).toEqual([])
      expect(data.fix.filter((slug) => !fix.has(slug))).toEqual([])
      expect(data.terms.filter((slug) => !terms.has(slug))).toEqual([])
      expect(data.related.filter((slug) => !same.has(slug) || slug === article.slug)).toEqual([])
    },
  )

  it.each(articles.map((article) => [`${article.dir}/${article.slug}`, article] as const))(
    '%s links to pages that exist, in its own language, and to at least six',
    (_name, article) => {
      const known = knownPaths()
      for (const one of articles.filter((other) => other.dir === article.dir)) {
        known.add(`/blog/${one.slug}`)
      }
      const prefix = article.dir === 'en' ? '/en' : ''
      const links = [...article.body.matchAll(/\]\((\/[^)\s]*)\)/g)].map((match) => match[1] ?? '')
      const broken = links.filter((href) => {
        if (article.dir === 'en' ? !href.startsWith('/en/') : href.startsWith('/en/')) return true
        return !known.has(href.slice(prefix.length))
      })
      expect(broken).toEqual([])
      expect(new Set(links).size).toBeGreaterThanOrEqual(6)
    },
  )

  it.each(ar.map((article) => [article.slug, article] as const))(
    '%s passes the Arabic rules the site scan applies to its pages',
    (_name, article) => {
      const text = prose(article.body)
      // ar-latin-punctuation: a Latin comma, semicolon or question mark right after an Arabic letter.
      expect(text.match(/[ء-ي][ً-ٟـ]*[,;?]/g)).toBeNull()
      // ar-digits-mixed: the page writes its numbers in one system (Western, as the site does).
      expect(text.match(/[٠-٩۰-۹]/g)).toBeNull()
      // ar-tatweel and the invisible characters of ar-ai-readability.
      expect(text.match(/[ء-ي]ـ+[ء-ي]/g)).toBeNull()
      expect(text.match(/[\u200b\u2060\ufeff\u200e\u200f\u061c]/g)).toBeNull()
      // ar-ai-readability: no presentation-form letters.
      expect(text.match(/[ﭐ-﷿ﹰ-﻾]/g)).toBeNull()
    },
  )

  it('never write the riyal sign (U+20C1): the site’s fonts lack it, as its own rule would say', () => {
    for (const article of articles) {
      expect(article.body).not.toContain('\u20c1')
      expect(JSON.stringify(article.data)).not.toContain('\u20c1')
    }
  })

  it('use no inline style or script', () => {
    for (const article of articles) {
      expect(article.body).not.toMatch(/style\s*=|<script/i)
    }
  })
})

describe('the owner’s review of the articles', () => {
  it('waits for every published article to say reviewed: true, and for no draft', () => {
    const file = (extra: string) => `---\ntitle: "x"\n${extra}\n---\nbody`
    expect(
      pendingReview({
        'ar/a.md': file('reviewed: false'),
        'ar/b.md': file('reviewed: true'),
        'ar/c.md': file('draft: true\nreviewed: false'),
        'en/d.md': file('draft: false\nreviewed: false'),
      }),
    ).toEqual(['ar/a.md', 'en/d.md'])
  })
})

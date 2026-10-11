import { BLOG_UI, type BlogTag } from '@arablyzer/i18n'
import { readingMinutes, renderArticle, type ArticleSection } from '@arablyzer/seo/article'
import { localePath, PATHS, type Lang } from '@arablyzer/seo/site'
import { getCollection } from 'astro:content'
import { isSlug } from './blog-schema'
import { fixHtml } from './fix-html'
import { GUIDES_DATA } from './guide-data'
import { LIBRARY_DATA } from './rule-data'
import { TOOLS_DATA } from './tool-data'

// The blog's articles as its pages need them (M6): the collection loaded once, each article's
// Markdown rendered, and every reference an article makes (a tool, a rule, a guide, a term,
// another article) checked, so that a renamed tool breaks the build and not a link.

export interface Post {
  readonly slug: string
  readonly lang: Lang
  readonly title: string
  readonly description: string
  readonly summary: string
  /** YYYY-MM-DD. */
  readonly date: string
  readonly updated: string | undefined
  /** The last change: the sitemap's lastmod and the feed's updated. */
  readonly lastmod: string
  readonly author: string
  readonly tags: readonly BlogTag[]
  readonly reviewed: boolean
  readonly tools: readonly string[]
  readonly rules: readonly string[]
  readonly fix: readonly string[]
  readonly terms: readonly string[]
  readonly related: readonly string[]
  readonly intro: string
  readonly sections: readonly ArticleSection[]
  readonly words: number
  readonly minutes: number
}

/**
 * A tag's dot, in the colour of the tool category it is closest to (the bento's and the directory's
 * dots), as whole class names for Tailwind to find.
 */
export const TAG_DOT: Readonly<Record<BlogTag, string>> = {
  'arabic-text': 'bg-cat-rtl',
  fonts: 'bg-cat-fonts',
  performance: 'bg-cat-speed',
  search: 'bg-cat-index',
  ecommerce: 'bg-cat-prices',
}

/** A tag has a page of its own once it holds this many articles: fewer is a thin page. */
export const TAG_MIN = 2

/** The class a heading inside an article's HTML wears; written here for Tailwind to find. */
const H3 = 'class="heading-3 mt-3"'

function decorate(html: string): string {
  return fixHtml(html.replaceAll('<h3 id=', `<h3 ${H3} id=`))
}

let loaded: Promise<readonly Post[]> | undefined

export function allPosts(): Promise<readonly Post[]> {
  loaded ??= load()
  return loaded
}

async function load(): Promise<readonly Post[]> {
  const entries = await getCollection('blog', ({ data }) => !data.draft)
  const posts = entries.map((entry): Post => {
    const [dir, slug = ''] = entry.id.split('/')
    const { data } = entry
    if (dir !== data.lang) throw new Error(`${entry.id}: lang is ${data.lang}, the folder ${dir}`)
    if (!isSlug(slug))
      throw new Error(`${entry.id}: the slug ${slug} is not a lowercase kebab slug`)
    const article = renderArticle(entry.body ?? '')
    return {
      slug,
      lang: data.lang,
      title: data.title,
      description: data.description,
      summary: data.summary,
      date: data.date,
      updated: data.updated,
      lastmod: data.updated ?? data.date,
      author: data.author ?? BLOG_UI[data.lang].article.defaultAuthor,
      tags: data.tags,
      reviewed: data.reviewed,
      tools: data.tools,
      rules: data.rules,
      fix: data.fix,
      terms: data.terms,
      related: data.related,
      intro: decorate(article.intro),
      sections: article.sections.map((section) => ({ ...section, html: decorate(section.html) })),
      words: article.words,
      minutes: readingMinutes(article.words),
    }
  })
  check(posts)
  return posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug, 'en'))
}

function check(posts: readonly Post[]): void {
  const tools = new Set(TOOLS_DATA.tools.map((tool) => tool.slug))
  const rules = new Set(LIBRARY_DATA.rules.map((rule) => rule.id))
  const fix = new Set(GUIDES_DATA.fix.map((guide) => guide.slug))
  const terms = new Set(GUIDES_DATA.glossary.map((term) => term.slug))
  const key = (lang: Lang, slug: string) => `${lang}/${slug}`
  const known = new Set(posts.map((post) => key(post.lang, post.slug)))
  for (const post of posts) {
    const where = key(post.lang, post.slug)
    const refs: readonly [string, readonly string[], ReadonlySet<string>][] = [
      ['tool', post.tools, tools],
      ['rule', post.rules, rules],
      ['fix guide', post.fix, fix],
      ['glossary term', post.terms, terms],
    ]
    for (const [kind, slugs, all] of refs) {
      for (const slug of slugs) {
        if (!all.has(slug)) throw new Error(`${where}: there is no ${kind} ${slug}`)
      }
    }
    for (const slug of post.related) {
      if (slug === post.slug) throw new Error(`${where}: an article is not related to itself`)
      if (!known.has(key(post.lang, slug))) throw new Error(`${where}: there is no article ${slug}`)
    }
    // Arabic is the original: an English article is a translation of an Arabic one.
    if (post.lang === 'en' && !known.has(key('ar', post.slug))) {
      throw new Error(`${where}: an English article needs the Arabic one with the same slug`)
    }
  }
}

/** A language's articles, newest first. */
export async function postsIn(lang: Lang): Promise<readonly Post[]> {
  return (await allPosts()).filter((post) => post.lang === lang)
}

export async function postBySlug(lang: Lang, slug: string): Promise<Post> {
  const post = (await allPosts()).find((one) => one.lang === lang && one.slug === slug)
  if (post === undefined) throw new Error(`There is no ${lang} article ${slug}`)
  return post
}

/** The same article in the other language, when someone translated it. */
export async function translationOf(post: Post): Promise<Post | undefined> {
  const other = post.lang === 'ar' ? 'en' : 'ar'
  return (await allPosts()).find((one) => one.lang === other && one.slug === post.slug)
}

/** The tags a language's articles carry that are many enough for a page, in the order of BLOG_TAGS. */
export async function tagsIn(lang: Lang): Promise<readonly { tag: BlogTag; count: number }[]> {
  const posts = await postsIn(lang)
  return (Object.keys(BLOG_UI[lang].tags) as BlogTag[])
    .map((tag) => ({ tag, count: posts.filter((post) => post.tags.includes(tag)).length }))
    .filter(({ count }) => count >= TAG_MIN)
}

export async function postsWithTag(lang: Lang, tag: BlogTag): Promise<readonly Post[]> {
  return (await postsIn(lang)).filter((post) => post.tags.includes(tag))
}

/** The article before this one in time, and the one after it, in its language. */
export async function neighbours(
  post: Post,
): Promise<{ readonly previous: Post | undefined; readonly next: Post | undefined }> {
  const posts = await postsIn(post.lang)
  const index = posts.findIndex((one) => one.slug === post.slug)
  // The list is newest first: the next in time is the one before in the list.
  return { previous: posts[index + 1], next: index > 0 ? posts[index - 1] : undefined }
}

/** The articles that name a tool, a rule, a guide or a term, for the page of that thing. */
export async function postsAbout(
  kind: 'tools' | 'rules' | 'fix' | 'terms',
  id: string,
  lang: Lang,
): Promise<readonly { href: string; title: string }[]> {
  return (await postsIn(lang))
    .filter((post) => post[kind].includes(id))
    .map((post) => ({ href: localePath(lang, PATHS.post(post.slug)), title: post.title }))
}

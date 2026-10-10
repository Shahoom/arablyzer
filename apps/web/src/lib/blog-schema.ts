import { BLOG_TAGS } from '@arablyzer/i18n'
import { z } from 'astro/zod'

// The frontmatter of an article (src/content/blog/<lang>/<slug>.md), checked when Astro loads the
// collection and again by test/blog.test.ts over the files. The same schema for both, so that a
// file the test passes is a file the build accepts.

const DAY = /^\d{4}-\d{2}-\d{2}$/
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** A date as the articles write it: YYYY-MM-DD, a real day. */
const day = z.string().refine((value) => {
  if (!DAY.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}, 'a date is YYYY-MM-DD')

const slugs = z.array(z.string().regex(KEBAB)).default([])

export const blogSchema = z
  .object({
    title: z.string().min(10).max(110),
    // A meta description and the line under the title: one or two sentences, short enough for a
    // search result to show whole.
    description: z.string().min(60).max(200),
    // The line under the title and in a list: one or two lines on a phone (M2.6 R7).
    summary: z.string().min(30).max(110),
    date: day,
    updated: day.optional(),
    author: z.string().min(2).optional(),
    tags: z.array(z.enum(BLOG_TAGS)).min(1).max(3),
    lang: z.enum(['ar', 'en']),
    draft: z.boolean().default(false),
    /**
     * Whether the owner has read the article (design decision 7, for the articles' own words as for
     * the interface copy). Written out in every file: an article that forgets it does not build.
     */
    reviewed: z.boolean(),
    // The pages the article is about, by slug or id: lib/blog.ts checks that each one exists.
    tools: slugs,
    rules: slugs,
    fix: slugs,
    terms: slugs,
    /** Other articles in the same language, by slug. */
    related: slugs,
  })
  .refine((post) => post.updated === undefined || post.updated >= post.date, {
    message: 'an article is not updated before it is published',
    path: ['updated'],
  })

export type BlogFrontmatter = z.infer<typeof blogSchema>

/** Slugs the blog's own routes use. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set(['tag', 'feed', 'atom'])

export function isSlug(slug: string): boolean {
  return KEBAB.test(slug) && !RESERVED_SLUGS.has(slug)
}

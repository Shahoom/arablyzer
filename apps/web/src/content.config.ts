import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { blogSchema } from './lib/blog-schema'

// The blog (M6): Markdown articles, Arabic in blog/ar and English in blog/en. An English article
// is a translation of the Arabic one with the same slug and exists only when someone wrote it:
// nothing pairs an article with a translation that is not there.
const blog = defineCollection({
  loader: glob({ pattern: '*/*.md', base: './src/content/blog' }),
  schema: blogSchema,
})

export const collections = { blog }

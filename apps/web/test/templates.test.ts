import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { representativePages, type BuiltPage } from '@arablyzer/seo/audit'
import { describe, expect, it } from 'vitest'

// M2.4d added /fix/<slug> and /glossary/<slug> beside the tools and the rules, and nothing told
// Lighthouse and the self-scan that each is one template: they measured every page, and the two
// CI jobs ran out of time. The pages of a dynamic route are one template by construction, so a
// directory that has one must be known to representativePages (TEMPLATES in packages/seo).
const PAGES = fileURLToPath(new URL('../src/pages/', import.meta.url))

/** The directories of the Arabic site that hold a dynamic route: tools/[slug].astro, and so on. */
const DYNAMIC = readdirSync(PAGES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'en')
  .filter((entry) =>
    readdirSync(path.join(PAGES, entry.name)).some((file) => /^\[[a-z]+\]\.astro$/.test(file)),
  )
  .map((entry) => entry.name)

describe('the pages of a dynamic route', () => {
  it('are found in the site’s routes', () => {
    expect(DYNAMIC).toContain('tools')
    expect(DYNAMIC).toContain('rules')
  })

  it.each(DYNAMIC)('are one template to the checks too slow for every page: /%s/…', (directory) => {
    const pages: BuiltPage[] = (['ar', 'en'] as const).flatMap((lang) =>
      ['a-page', 'b-page'].map((slug) => ({
        path: `${lang === 'en' ? '/en' : ''}/${directory}/${slug}`,
        file: `${directory}/${slug}.html`,
        lang,
      })),
    )
    expect(representativePages(pages).map((page) => page.path)).toEqual([
      `/${directory}/a-page`,
      `/en/${directory}/a-page`,
    ])
  })
})

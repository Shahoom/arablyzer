import type { PageFacts } from '@arablyzer/collectors'
import { detectPlatforms } from '../../lib/platforms'
import { defineRule, type DetectorFinding } from '../../rule'

/**
 * What Zid writes for a store whose owner has not set an SEO title and description: seen on Zid's
 * demo store (demo.zid.store, 2026-11-04), «<store name> | متجر إلكتروني» and «اكتشف منتجات
 * وتشكيلات وأحدث عروض <store name>.». The wording is Zid's and can change.
 */
const DEFAULT_TITLE = /\s\|\s*متجر إلكتروني\s*$/u
const DEFAULT_DESCRIPTION = /^\s*اكتشف منتجات وتشكيلات وأحدث عروض/u

function isZid(page: PageFacts): boolean {
  return detectPlatforms(page).some((tech) => tech.id === 'zid' && tech.confidence >= 50)
}

/**
 * M10.1: a page of a Zid store whose title or description is the one Zid writes when the store's
 * owner has set none. Such a title names no product and such a description is the same on every
 * store, so search shows a result that says nothing a shopper can choose by.
 */
export const rule = defineRule({
  id: 'zid-default-seo',
  version: '1.0.0',
  category: 'onpage',
  severity: 'moderate',
  needs: ['html'],
  messages: ['title', 'description'],
  appliesTo: (page) => page.html !== null && isZid(page),
  detect: ({ page }): DetectorFinding<'title' | 'description'>[] => {
    const html = page.html
    if (html === null) return []
    const findings: DetectorFinding<'title' | 'description'>[] = []
    const title = html.title?.trim() ?? ''
    if (DEFAULT_TITLE.test(title)) {
      findings.push({
        message: 'title',
        values: { title },
        ...(html.titleElement === null ? {} : { selector: html.titleElement.selector }),
      })
    }
    const description = html.metas.find((meta) => meta.name === 'description')
    if (description?.content != null && DEFAULT_DESCRIPTION.test(description.content)) {
      findings.push({
        message: 'description',
        values: { description: description.content.trim() },
        selector: description.selector,
      })
    }
    return findings
  },
})

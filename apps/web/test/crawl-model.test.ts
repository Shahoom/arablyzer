import type { CrawlReport, CrawlSummary } from '@arablyzer/api-contract/codes'
import { CRAWL_UI } from '@arablyzer/i18n/crawl'
import { describe, expect, it } from 'vitest'
import {
  isActive,
  isCrawlList,
  isCrawlPages,
  isCrawlReport,
  isCrawlSummary,
  templateLabel,
  templateName,
} from '../src/islands/crawl-model'

const SUMMARY: CrawlSummary = {
  id: 'c'.repeat(22),
  siteId: 's'.repeat(22),
  origin: 'https://shop.example',
  state: 'rendering',
  error: null,
  pagesFound: 40,
  pagesChecked: 30,
  pageCap: 50,
  templates: 2,
  rendered: { done: 1, total: 2 },
  createdAt: '2026-10-09T12:00:00.000Z',
  finishedAt: null,
}
const REPORT: CrawlReport = {
  crawl: SUMMARY,
  templates: [
    {
      key: 't1',
      kind: 'product',
      pattern: '/products/:slug',
      found: 30,
      checked: 20,
      topIssues: ['title-missing'],
      representatives: [
        { url: 'https://shop.example/products/a', scanId: null, state: null, score: null },
      ],
    },
  ],
  issues: [
    {
      ruleId: 'title-missing',
      severity: 'serious',
      title: { ar: 'العنوان مفقود', en: 'Title missing' },
      rendered: false,
      pages: 18,
      templates: [
        { template: 't1', pages: 18, checked: 20, examples: ['https://shop.example/products/a'] },
      ],
    },
  ],
}

describe('the crawl shapes the page reads', () => {
  it('accepts what the API sends and refuses the rest', () => {
    expect(isCrawlSummary(SUMMARY)).toBe(true)
    expect(isCrawlSummary({ ...SUMMARY, state: 'weird' })).toBe(false)
    expect(isCrawlSummary({ ...SUMMARY, rendered: null })).toBe(false)
    expect(isCrawlSummary(null)).toBe(false)
    expect(isCrawlReport(REPORT)).toBe(true)
    expect(isCrawlReport({ ...REPORT, issues: [{ ruleId: 'x' }] })).toBe(false)
    expect(isCrawlReport({ ...REPORT, templates: [{ ...REPORT.templates[0], kind: 'odd' }] })).toBe(
      false,
    )
    expect(isCrawlList({ crawls: [SUMMARY] })).toBe(true)
    expect(isCrawlList({ crawls: [{}] })).toBe(false)
    expect(isCrawlPages({ pages: [], next: null })).toBe(true)
    expect(
      isCrawlPages({
        pages: [
          {
            url: 'https://shop.example/a',
            depth: 1,
            status: 200,
            state: 'checked',
            template: 't1',
            title: null,
            issues: [{ ruleId: 'x', severity: 'minor', count: 1 }],
            scanId: null,
          },
        ],
        next: 100,
      }),
    ).toBe(true)
    expect(isCrawlPages({ pages: [{ url: 1 }], next: null })).toBe(false)
  })

  it('tells a crawl that is still going', () => {
    expect(['queued', 'running', 'rendering'].every((s) => isActive(s as 'queued'))).toBe(true)
    expect(['done', 'failed', 'cancelled'].some((s) => isActive(s as 'done'))).toBe(false)
  })

  it('names a template from its kind and its pattern, and a standalone one in words', () => {
    const t = CRAWL_UI.en.report
    expect(templateLabel(t, { kind: 'product', pattern: '/products/:slug' })).toBe(
      'Product page · /products/:slug',
    )
    expect(templateName(t, { kind: 'standalone', pattern: '*' }).pattern).toBe(t.standalonePattern)
    expect(templateLabel(CRAWL_UI.ar.report, { kind: 'article', pattern: '/blog/:date' })).toBe(
      'مقال · /blog/:date',
    )
  })
})

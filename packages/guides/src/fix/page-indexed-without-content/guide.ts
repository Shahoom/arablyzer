import type { FixGuideDefinition } from '../../fix'

export const definition: FixGuideDefinition = {
  slug: 'page-indexed-without-content',
  source: 'search-console',
  report: 'page-indexing',
  status: 'warning',
  message: {
    en: 'Page indexed without content',
    ar: 'تمت فهرسة الصفحة بدون المحتوى',
  },
  tools: ['js-rendering-check', 'indexability-check'],
  rules: ['js-only-content'],
  related: ['soft-404', 'crawled-currently-not-indexed'],
  updated: '2026-11-06',
}

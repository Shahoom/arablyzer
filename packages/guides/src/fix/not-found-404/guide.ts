import type { FixGuideDefinition } from '../../fix'

export const definition: FixGuideDefinition = {
  slug: 'not-found-404',
  source: 'search-console',
  report: 'page-indexing',
  status: 'not-indexed',
  message: {
    en: 'Not found (404)',
    ar: 'لم يتم العثور على الصفحة (404)',
  },
  tools: [],
  rules: [],
  related: ['soft-404', 'page-with-redirect'],
  updated: '2026-09-29',
}

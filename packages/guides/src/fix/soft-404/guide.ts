import type { FixGuideDefinition } from '../../fix'

export const definition: FixGuideDefinition = {
  slug: 'soft-404',
  source: 'search-console',
  report: 'page-indexing',
  status: 'not-indexed',
  message: {
    en: 'Soft 404',
    ar: 'Soft 404',
  },
  tools: [],
  rules: [],
  related: ['not-found-404', 'crawled-currently-not-indexed'],
  updated: '2026-09-29',
}

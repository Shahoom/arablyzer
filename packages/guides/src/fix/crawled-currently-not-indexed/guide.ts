import type { FixGuideDefinition } from '../../fix'

export const definition: FixGuideDefinition = {
  slug: 'crawled-currently-not-indexed',
  source: 'search-console',
  report: 'page-indexing',
  status: 'not-indexed',
  message: {
    en: 'Crawled - currently not indexed',
    ar: 'تم الزحف إلى الصفحة، ولم تتم فهرستها حتى الآن',
  },
  tools: ['indexability-check', 'title-meta-check', 'heading-structure'],
  rules: ['page-noindex'],
  related: ['discovered-currently-not-indexed', 'duplicate-without-user-selected-canonical'],
  updated: '2026-09-29',
}

import type { FixGuideDefinition } from '../../fix'

export const definition: FixGuideDefinition = {
  slug: 'discovered-currently-not-indexed',
  source: 'search-console',
  report: 'page-indexing',
  status: 'not-indexed',
  message: {
    en: 'Discovered - currently not indexed',
    ar: 'تم اكتشاف الصفحة، ولكن لم تتم فهرستها حتى الآن',
  },
  tools: ['indexability-check'],
  rules: [],
  related: ['crawled-currently-not-indexed', 'server-error-5xx'],
  updated: '2026-09-29',
}

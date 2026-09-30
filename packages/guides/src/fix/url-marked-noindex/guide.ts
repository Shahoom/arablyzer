import type { FixGuideDefinition } from '../../fix'

export const definition: FixGuideDefinition = {
  slug: 'url-marked-noindex',
  source: 'search-console',
  report: 'page-indexing',
  status: 'not-indexed',
  message: {
    en: "URL marked 'noindex'",
    ar: 'تم تمييز عنوان URL بعلامة noindex',
  },
  tools: ['indexability-check'],
  rules: ['page-noindex'],
  related: ['url-blocked-by-robots-txt', 'crawled-currently-not-indexed'],
  updated: '2026-09-29',
}

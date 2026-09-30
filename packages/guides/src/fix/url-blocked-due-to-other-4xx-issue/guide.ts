import type { FixGuideDefinition } from '../../fix'

export const definition: FixGuideDefinition = {
  slug: 'url-blocked-due-to-other-4xx-issue',
  source: 'search-console',
  report: 'page-indexing',
  status: 'not-indexed',
  message: {
    en: 'URL blocked due to other 4xx issue',
    ar: 'تم حظر عنوان URL بسبب مشكلة أخرى من نوع 4xx',
  },
  tools: [],
  rules: [],
  related: ['not-found-404', 'blocked-due-to-access-forbidden-403'],
  updated: '2026-09-29',
}

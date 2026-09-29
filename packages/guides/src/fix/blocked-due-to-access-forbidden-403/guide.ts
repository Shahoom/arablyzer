import type { FixGuideDefinition } from '../../fix'

export const definition: FixGuideDefinition = {
  slug: 'blocked-due-to-access-forbidden-403',
  source: 'search-console',
  report: 'page-indexing',
  status: 'not-indexed',
  message: {
    en: 'Blocked due to access forbidden (403)',
    ar: 'تم حظر الوصول إلى الصفحة لأنّ الوصول ممنوع (403)',
  },
  tools: [],
  rules: [],
  related: ['blocked-due-to-unauthorized-request-401', 'url-blocked-due-to-other-4xx-issue'],
  updated: '2026-09-29',
}

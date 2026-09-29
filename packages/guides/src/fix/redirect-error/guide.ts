import type { FixGuideDefinition } from '../../fix'

export const definition: FixGuideDefinition = {
  slug: 'redirect-error',
  source: 'search-console',
  report: 'page-indexing',
  status: 'not-indexed',
  message: {
    en: 'Redirect error',
    ar: 'خطأ في إعادة التوجيه',
  },
  tools: [],
  rules: [],
  related: ['page-with-redirect', 'server-error-5xx'],
  updated: '2026-09-29',
}

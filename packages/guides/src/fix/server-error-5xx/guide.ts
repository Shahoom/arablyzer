import type { FixGuideDefinition } from '../../fix'

export const definition: FixGuideDefinition = {
  slug: 'server-error-5xx',
  source: 'search-console',
  report: 'page-indexing',
  status: 'not-indexed',
  message: {
    en: 'Server error (5xx)',
    ar: 'خطأ في الخادم (5xx)',
  },
  tools: [],
  rules: [],
  related: ['redirect-error', 'soft-404'],
  updated: '2026-09-29',
}

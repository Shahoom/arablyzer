import type { FixGuideDefinition } from '../../fix'

export const definition: FixGuideDefinition = {
  slug: 'page-with-redirect',
  source: 'search-console',
  report: 'page-indexing',
  status: 'not-indexed',
  message: {
    en: 'Page with redirect',
    ar: 'صفحة تتضمّن إعادة توجيه',
  },
  tools: ['canonical-check'],
  rules: [],
  related: ['redirect-error', 'not-found-404'],
  updated: '2026-09-29',
}

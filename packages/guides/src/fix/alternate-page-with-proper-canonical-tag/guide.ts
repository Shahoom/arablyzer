import type { FixGuideDefinition } from '../../fix'

export const definition: FixGuideDefinition = {
  slug: 'alternate-page-with-proper-canonical-tag',
  source: 'search-console',
  report: 'page-indexing',
  status: 'not-indexed',
  message: {
    en: 'Alternate page with proper canonical tag',
    ar: 'صفحة بديلة تتضمن علامة أساسية مناسبة',
  },
  tools: ['canonical-check', 'hreflang-check'],
  rules: ['canonical-conflict'],
  related: [
    'duplicate-without-user-selected-canonical',
    'duplicate-google-chose-different-canonical-than-user',
  ],
  updated: '2026-09-29',
}

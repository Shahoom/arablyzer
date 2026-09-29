import type { FixGuideDefinition } from '../../fix'

export const definition: FixGuideDefinition = {
  slug: 'duplicate-without-user-selected-canonical',
  source: 'search-console',
  report: 'page-indexing',
  status: 'not-indexed',
  message: {
    en: 'Duplicate without user-selected canonical',
    ar: 'نسخة طبق الأصل لم يختَرها المستخدم نسخة أساسية',
  },
  tools: ['canonical-check'],
  rules: ['canonical-conflict'],
  related: [
    'duplicate-google-chose-different-canonical-than-user',
    'alternate-page-with-proper-canonical-tag',
  ],
  updated: '2026-09-29',
}

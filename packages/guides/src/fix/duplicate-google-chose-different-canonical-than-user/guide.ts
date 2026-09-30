import type { FixGuideDefinition } from '../../fix'

export const definition: FixGuideDefinition = {
  slug: 'duplicate-google-chose-different-canonical-than-user',
  source: 'search-console',
  report: 'page-indexing',
  status: 'not-indexed',
  message: {
    en: 'Duplicate, Google chose different canonical than user',
    ar: 'نسخة طبق الأصل، اختار محرك بحث Google صفحة أساسية غير اختيار المستخدم',
  },
  tools: ['canonical-check'],
  rules: ['canonical-conflict'],
  related: [
    'duplicate-without-user-selected-canonical',
    'alternate-page-with-proper-canonical-tag',
  ],
  updated: '2026-09-29',
}

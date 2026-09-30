import type { FixGuideDefinition } from '../../fix'

export const definition: FixGuideDefinition = {
  slug: 'blocked-due-to-unauthorized-request-401',
  source: 'search-console',
  report: 'page-indexing',
  status: 'not-indexed',
  message: {
    en: 'Blocked due to unauthorized request (401)',
    ar: 'تم حظر الوصول إلى الصفحة بسبب طلب غير مصرّح به (401)',
  },
  tools: [],
  rules: [],
  related: ['blocked-due-to-access-forbidden-403', 'url-blocked-due-to-other-4xx-issue'],
  updated: '2026-09-29',
}

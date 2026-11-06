import type { FixGuideDefinition } from '../../fix'

export const definition: FixGuideDefinition = {
  slug: 'indexed-though-blocked-by-robots-txt',
  source: 'search-console',
  report: 'page-indexing',
  status: 'warning',
  message: {
    en: 'Indexed, though blocked by robots.txt',
    ar: 'تمت فهرسة الصفحة علمًا أنّها محظورة باستخدام ملف robots.txt',
  },
  tools: ['robots-check', 'indexability-check'],
  rules: ['robots-blocks-googlebot', 'page-noindex'],
  related: ['url-blocked-by-robots-txt', 'url-marked-noindex'],
  updated: '2026-11-06',
}

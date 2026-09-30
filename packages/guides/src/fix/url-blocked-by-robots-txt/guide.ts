import type { FixGuideDefinition } from '../../fix'

export const definition: FixGuideDefinition = {
  slug: 'url-blocked-by-robots-txt',
  source: 'search-console',
  report: 'page-indexing',
  status: 'not-indexed',
  message: {
    en: 'URL blocked by robots.txt',
    ar: 'تم حظر عنوان URL باستخدام ملف robots.txt',
  },
  tools: ['robots-check', 'indexability-check'],
  rules: ['robots-blocks-googlebot'],
  related: ['url-marked-noindex'],
  updated: '2026-09-29',
}

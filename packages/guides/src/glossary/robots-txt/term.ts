import type { GlossaryTermDefinition } from '../../glossary'

export const definition: GlossaryTermDefinition = {
  slug: 'robots-txt',
  term: 'robots.txt',
  tools: ['robots-check', 'ai-crawler-check'],
  rules: ['robots-blocks-googlebot', 'robots-blocks-ai-search'],
  guides: ['url-blocked-by-robots-txt'],
  related: ['crawling', 'noindex', 'xml-sitemap', 'ai-crawlers'],
  updated: '2026-09-29',
}

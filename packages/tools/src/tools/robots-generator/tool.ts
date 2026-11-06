import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'robots-generator',
  kind: 'generator',
  category: 'crawl',
  rules: ['robots-blocks-googlebot', 'robots-blocks-ai-search'],
  related: [
    'robots-check',
    'robots-tester',
    'ai-crawler-check',
    'sitemap-check',
    'sitemap-generator',
  ],
  updated: '2026-11-04',
}

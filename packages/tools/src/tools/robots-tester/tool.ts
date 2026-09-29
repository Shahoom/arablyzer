import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'robots-tester',
  kind: 'paste',
  category: 'crawl',
  rules: ['robots-blocks-googlebot', 'robots-blocks-ai-search'],
  related: ['robots-check', 'ai-crawler-check'],
  updated: '2026-09-29',
}

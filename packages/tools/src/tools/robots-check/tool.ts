import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'robots-check',
  category: 'crawl',
  rules: ['robots-blocks-googlebot'],
  related: ['ai-crawler-check', 'indexability-check'],
  updated: '2026-09-29',
}

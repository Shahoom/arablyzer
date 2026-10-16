import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'url-parameters-check',
  category: 'crawl',
  rules: ['url-parameters-links'],
  related: ['canonical-check', 'pagination-check', 'indexability-check', 'broken-links'],
  updated: '2026-10-11',
}

import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'pagination-check',
  category: 'crawl',
  rules: ['pagination-canonical'],
  related: ['canonical-check', 'url-parameters-check', 'indexability-check', 'sitemap-check'],
  updated: '2026-10-11',
}

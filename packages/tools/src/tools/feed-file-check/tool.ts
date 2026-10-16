import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'feed-file-check',
  category: 'commerce',
  rules: ['feed-file-unreadable'],
  related: ['feed-check', 'sitemap-check', 'product-page-check'],
  updated: '2026-10-11',
}

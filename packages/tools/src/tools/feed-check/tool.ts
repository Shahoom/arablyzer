import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'feed-check',
  category: 'commerce',
  rules: ['feed-required-missing', 'feed-values-invalid', 'feed-text-quality'],
  related: ['feed-file-check', 'price-format-check', 'product-page-check'],
  updated: '2026-10-11',
}

import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'price-format-check',
  category: 'commerce',
  rules: ['price-decimals'],
  related: ['product-page-check', 'digits-consistency'],
  updated: '2026-09-29',
}

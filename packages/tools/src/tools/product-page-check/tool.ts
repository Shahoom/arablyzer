import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'product-page-check',
  category: 'commerce',
  rules: ['product-offer-invalid', 'price-decimals'],
  related: ['price-format-check', 'structured-data-check'],
  updated: '2026-09-29',
}

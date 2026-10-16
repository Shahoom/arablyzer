import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'product-schema-check',
  category: 'schema',
  rules: [
    'product-offer-invalid',
    'product-required-missing',
    'product-rating-invalid',
    'product-availability-invalid',
  ],
  related: ['product-page-check', 'structured-data-check', 'price-format-check', 'feed-check'],
  updated: '2026-10-11',
}

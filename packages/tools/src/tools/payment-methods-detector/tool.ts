import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'payment-methods-detector',
  category: 'commerce',
  rules: ['payment-methods'],
  related: ['product-page-check', 'price-format-check'],
  updated: '2026-09-29',
}

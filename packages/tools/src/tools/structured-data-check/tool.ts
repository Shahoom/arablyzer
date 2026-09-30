import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'structured-data-check',
  category: 'schema',
  rules: ['jsonld-syntax-error', 'product-offer-invalid'],
  related: ['product-page-check', 'social-preview'],
  updated: '2026-09-29',
}

import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'schema-generator',
  kind: 'generator',
  category: 'schema',
  rules: ['jsonld-syntax-error', 'product-offer-invalid'],
  related: ['structured-data-check', 'product-page-check'],
  updated: '2026-09-29',
}

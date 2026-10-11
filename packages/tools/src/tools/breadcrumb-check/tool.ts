import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'breadcrumb-check',
  category: 'schema',
  rules: ['breadcrumb-schema-invalid'],
  related: ['structured-data-check', 'product-schema-check', 'local-business-check', 'schema-generator'],
  updated: '2026-10-11',
}

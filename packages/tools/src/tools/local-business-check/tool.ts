import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'local-business-check',
  category: 'schema',
  rules: ['local-business-invalid'],
  related: ['structured-data-check', 'product-schema-check', 'phone-format-check', 'schema-generator'],
  updated: '2026-10-11',
}

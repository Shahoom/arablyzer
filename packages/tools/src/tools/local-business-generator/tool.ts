import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'local-business-generator',
  kind: 'generator',
  category: 'schema',
  rules: ['local-business-invalid', 'address-schema-gulf'],
  related: ['local-business-check', 'address-format', 'phone-format-check', 'schema-generator'],
  updated: '2026-11-04',
}

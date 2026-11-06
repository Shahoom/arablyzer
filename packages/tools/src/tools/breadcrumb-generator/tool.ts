import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'breadcrumb-generator',
  kind: 'generator',
  category: 'schema',
  rules: ['breadcrumb-schema-invalid'],
  related: [
    'breadcrumb-check',
    'structured-data-check',
    'schema-generator',
    'local-business-generator',
  ],
  updated: '2026-11-04',
}

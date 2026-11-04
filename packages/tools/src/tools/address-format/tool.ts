import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'address-format',
  category: 'locale',
  rules: ['address-schema-gulf'],
  related: [
    'local-business-check',
    'phone-format-check',
    'structured-data-check',
    'schema-generator',
  ],
  updated: '2026-11-04',
}

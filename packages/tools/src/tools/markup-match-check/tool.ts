import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'markup-match-check',
  category: 'schema',
  rules: ['markup-content-mismatch'],
  related: [
    'product-schema-check',
    'structured-data-check',
    'answer-readiness',
    'product-page-check',
  ],
  updated: '2026-11-04',
}

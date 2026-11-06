import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'faq-schema-generator',
  kind: 'generator',
  category: 'schema',
  rules: ['faq-schema-mismatch'],
  related: [
    'answer-readiness',
    'structured-data-check',
    'schema-generator',
    'ai-readability-check',
  ],
  updated: '2026-11-04',
}

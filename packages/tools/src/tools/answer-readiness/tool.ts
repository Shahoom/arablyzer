import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'answer-readiness',
  category: 'ai',
  rules: ['faq-schema-mismatch'],
  related: [
    'faq-schema-generator',
    'ai-readability-check',
    'structured-data-check',
    'js-rendering-check',
  ],
  updated: '2026-11-04',
}

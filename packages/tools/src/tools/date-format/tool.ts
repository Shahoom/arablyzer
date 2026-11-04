import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'date-format',
  category: 'locale',
  rules: ['date-forms-mixed'],
  related: ['digits-consistency', 'freshness-check', 'number-format', 'currency-format'],
  updated: '2026-11-04',
}

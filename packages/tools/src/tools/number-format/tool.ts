import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'number-format',
  category: 'locale',
  rules: ['number-separators-mixed', 'ar-digits-mixed'],
  related: ['digits-consistency', 'currency-format', 'date-format', 'price-format-check'],
  updated: '2026-11-04',
}

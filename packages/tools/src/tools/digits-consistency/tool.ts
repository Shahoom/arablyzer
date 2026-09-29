import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'digits-consistency',
  category: 'ar-content',
  rules: ['ar-digits-mixed'],
  related: ['arabic-punctuation-check', 'price-format-check'],
  updated: '2026-09-29',
}

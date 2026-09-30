import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'arabic-shaping-check',
  category: 'ar-render',
  rules: ['ar-letter-spacing', 'ar-font-missing-letters'],
  related: ['letter-spacing-check', 'arabic-font-check'],
  updated: '2026-09-29',
}

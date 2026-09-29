import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'letter-spacing-check',
  category: 'ar-render',
  rules: ['ar-letter-spacing'],
  related: ['arabic-shaping-check', 'font-fallback-check'],
  updated: '2026-09-29',
}

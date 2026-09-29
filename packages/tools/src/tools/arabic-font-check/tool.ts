import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'arabic-font-check',
  category: 'ar-render',
  rules: ['ar-font-no-arabic', 'ar-font-missing-letters'],
  related: ['font-fallback-check', 'arabic-shaping-check'],
  updated: '2026-09-29',
}

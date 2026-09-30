import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'arabic-punctuation-check',
  category: 'ar-content',
  rules: ['ar-latin-punctuation'],
  related: ['digits-consistency', 'tatweel-check'],
  updated: '2026-09-29',
}

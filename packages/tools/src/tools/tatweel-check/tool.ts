import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'tatweel-check',
  category: 'ar-content',
  rules: ['ar-tatweel'],
  related: ['arabic-punctuation-check', 'digits-consistency'],
  updated: '2026-09-29',
}

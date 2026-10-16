import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'arabic-encoding-check',
  category: 'ar-content',
  rules: ['ar-mojibake'],
  related: ['language-check', 'tatweel-check', 'digits-consistency', 'arabic-punctuation-check'],
  updated: '2026-10-11',
}

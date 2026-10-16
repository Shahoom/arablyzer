import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'arabic-spell-check',
  category: 'ar-content',
  rules: ['ar-spelling'],
  related: ['common-misspellings', 'dialect-detector', 'ai-readability-check', 'brand-name-check'],
  updated: '2026-10-16',
}

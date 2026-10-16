import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'dialect-detector',
  category: 'ar-content',
  rules: ['dialect-register'],
  related: ['country-fit', 'arabic-spell-check', 'ai-readability-check', 'language-check'],
  updated: '2026-10-16',
}

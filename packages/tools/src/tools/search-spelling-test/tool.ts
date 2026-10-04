import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'search-spelling-test',
  category: 'ar-content',
  rules: ['search-spelling-variants'],
  related: ['tatweel-check', 'digits-consistency', 'platform-check'],
  updated: '2026-10-04',
}

import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'common-misspellings',
  category: 'ar-content',
  rules: ['misspellings-uncovered'],
  related: ['search-spelling-test', 'tatweel-check', 'title-meta-check'],
  updated: '2026-10-04',
}

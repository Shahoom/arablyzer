import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'brand-name-check',
  category: 'onpage',
  rules: ['brand-name-consistency'],
  related: ['structured-data-check', 'social-preview', 'title-meta-check', 'common-misspellings'],
  updated: '2026-10-11',
}

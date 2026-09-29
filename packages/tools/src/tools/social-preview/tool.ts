import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'social-preview',
  category: 'onpage',
  rules: ['og-tags-missing'],
  related: ['title-meta-check', 'structured-data-check'],
  updated: '2026-09-29',
}

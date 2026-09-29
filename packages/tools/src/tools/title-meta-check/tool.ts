import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'title-meta-check',
  category: 'onpage',
  rules: ['title-missing', 'meta-description-missing'],
  related: ['heading-structure', 'social-preview'],
  updated: '2026-09-29',
}

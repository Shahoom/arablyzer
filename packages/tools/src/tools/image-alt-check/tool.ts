import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'image-alt-check',
  category: 'onpage',
  rules: ['a11y-image-alt'],
  related: ['accessibility-check', 'image-weight', 'social-preview', 'heading-structure'],
  updated: '2026-10-11',
}

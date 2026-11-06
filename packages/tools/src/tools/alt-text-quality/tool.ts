import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'alt-text-quality',
  category: 'onpage',
  rules: ['image-alt-quality'],
  related: ['image-alt-check', 'accessibility-check', 'image-weight', 'social-preview'],
  updated: '2026-11-04',
}

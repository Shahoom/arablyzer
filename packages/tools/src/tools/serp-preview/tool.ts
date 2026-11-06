import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'serp-preview',
  kind: 'generator',
  category: 'onpage',
  rules: ['title-missing', 'meta-description-missing'],
  related: ['title-meta-check', 'meta-tag-generator', 'social-preview', 'heading-structure'],
  updated: '2026-11-04',
}

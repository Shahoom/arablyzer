import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'meta-tag-generator',
  kind: 'generator',
  category: 'onpage',
  rules: ['title-missing', 'meta-description-missing', 'og-tags-missing', 'viewport-missing'],
  related: ['title-meta-check', 'social-preview', 'og-image-check', 'serp-preview'],
  updated: '2026-11-04',
}

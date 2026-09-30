import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'image-weight',
  category: 'speed',
  rules: ['image-format-legacy'],
  related: ['accessibility-check', 'product-page-check'],
  updated: '2026-09-29',
}

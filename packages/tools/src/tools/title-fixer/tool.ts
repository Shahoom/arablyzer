import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'title-fixer',
  kind: 'generator',
  category: 'commerce',
  rules: ['feed-text-quality'],
  related: ['feed-check', 'feed-file-check', 'product-page-check', 'arabic-slug-generator'],
  updated: '2026-11-04',
}

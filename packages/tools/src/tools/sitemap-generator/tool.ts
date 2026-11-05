import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'sitemap-generator',
  kind: 'generator',
  category: 'index',
  rules: ['sitemap-invalid'],
  related: ['sitemap-check', 'sitemap-diff', 'robots-generator', 'indexability-check'],
  updated: '2026-11-04',
}

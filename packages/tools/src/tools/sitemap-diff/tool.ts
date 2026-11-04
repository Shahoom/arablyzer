import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'sitemap-diff',
  kind: 'paste',
  category: 'index',
  rules: ['sitemap-invalid'],
  related: ['sitemap-check', 'sitemap-generator', 'indexability-check', 'redirect-planner'],
  updated: '2026-11-04',
}

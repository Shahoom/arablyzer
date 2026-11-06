import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'sitemap-lastmod-check',
  category: 'index',
  rules: ['sitemap-lastmod-invalid'],
  related: ['sitemap-check', 'sitemap-generator', 'sitemap-diff', 'freshness-check'],
  updated: '2026-11-04',
}

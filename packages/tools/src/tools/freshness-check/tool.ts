import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'freshness-check',
  category: 'crawl',
  rules: ['freshness-date-invalid'],
  related: ['title-meta-check', 'structured-data-check', 'sitemap-check', 'indexability-check'],
  updated: '2026-10-11',
}

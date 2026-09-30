import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'sitemap-check',
  category: 'crawl',
  rules: ['sitemap-missing', 'sitemap-invalid'],
  related: ['robots-check', 'redirect-chain-check', 'indexability-check'],
  updated: '2026-09-29',
}

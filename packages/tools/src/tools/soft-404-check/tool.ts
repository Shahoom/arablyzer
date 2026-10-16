import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'soft-404-check',
  category: 'crawl',
  rules: ['soft-404-signals'],
  related: ['redirect-chain-check', 'indexability-check', 'broken-links', 'sitemap-check'],
  updated: '2026-10-11',
}

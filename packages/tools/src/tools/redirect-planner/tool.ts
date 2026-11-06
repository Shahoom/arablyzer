import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'redirect-planner',
  kind: 'paste',
  category: 'seo-tools',
  rules: ['redirect-chain', 'redirect-temporary'],
  related: ['redirect-chain-check', 'redirect-generator', 'sitemap-diff', 'canonical-check'],
  updated: '2026-11-04',
}

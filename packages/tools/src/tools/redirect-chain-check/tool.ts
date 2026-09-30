import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'redirect-chain-check',
  category: 'crawl',
  rules: ['redirect-chain', 'redirect-temporary'],
  related: ['indexability-check', 'canonical-check', 'robots-check', 'tls-check'],
  updated: '2026-09-29',
}

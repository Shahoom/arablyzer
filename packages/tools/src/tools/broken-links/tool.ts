import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'broken-links',
  category: 'links',
  rules: ['link-broken'],
  related: ['redirect-chain-check', 'indexability-check', 'robots-check'],
  updated: '2026-09-29',
}

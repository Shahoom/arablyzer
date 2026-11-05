import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'redirect-generator',
  kind: 'generator',
  category: 'seo-tools',
  rules: ['redirect-chain', 'redirect-temporary'],
  related: ['redirect-chain-check', 'redirect-planner', 'robots-generator', 'canonical-check'],
  updated: '2026-11-04',
}

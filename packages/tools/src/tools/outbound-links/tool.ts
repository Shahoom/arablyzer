import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'outbound-links',
  category: 'links',
  rules: ['outbound-links-found'],
  related: ['broken-links', 'anchor-text-check', 'contact-reachability', 'redirect-chain-check'],
  updated: '2026-11-04',
}

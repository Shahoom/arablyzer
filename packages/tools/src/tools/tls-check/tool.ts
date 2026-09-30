import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'tls-check',
  category: 'trust',
  rules: ['https-missing', 'tls-expiring', 'hsts-missing'],
  related: ['security-headers', 'mixed-content', 'redirect-chain-check'],
  updated: '2026-09-29',
}

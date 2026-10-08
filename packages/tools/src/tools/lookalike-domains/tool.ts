import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'lookalike-domains',
  category: 'trust',
  rules: ['lookalike-domains'],
  related: ['email-security', 'tls-check', 'security-headers'],
  updated: '2026-10-04',
}

import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'email-security',
  category: 'trust',
  rules: ['spf-missing', 'dmarc-missing'],
  related: ['security-headers', 'tls-check'],
  updated: '2026-09-29',
}

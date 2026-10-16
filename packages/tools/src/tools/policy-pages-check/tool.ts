import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'policy-pages-check',
  category: 'trust',
  rules: ['policy-pages-missing'],
  related: ['payment-methods-detector', 'security-headers', 'platform-check', 'product-page-check'],
  updated: '2026-10-11',
}

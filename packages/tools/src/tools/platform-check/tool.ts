import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'platform-check',
  category: 'onpage',
  rules: ['platform-detected'],
  related: ['payment-methods-detector', 'security-headers', 'js-rendering-check'],
  updated: '2026-10-04',
}

import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'hreflang-check',
  category: 'intl',
  rules: ['hreflang-invalid-code'],
  related: ['language-check', 'canonical-check'],
  updated: '2026-09-29',
}

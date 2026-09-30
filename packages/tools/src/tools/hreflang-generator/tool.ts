import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'hreflang-generator',
  kind: 'generator',
  category: 'intl',
  rules: ['hreflang-invalid-code'],
  related: ['hreflang-check', 'language-check'],
  updated: '2026-09-29',
}

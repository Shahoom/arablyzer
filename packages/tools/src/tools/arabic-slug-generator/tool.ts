import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'arabic-slug-generator',
  kind: 'generator',
  category: 'general',
  rules: ['url-slug-invalid'],
  related: [
    'canonical-check',
    'url-parameters-check',
    'redirect-chain-check',
    'hreflang-generator',
  ],
  updated: '2026-11-04',
}

import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'store-hreflang-check',
  category: 'intl',
  rules: [
    'hreflang-invalid-code',
    'hreflang-set-invalid',
    'hreflang-x-default-missing',
    'hreflang-lang-mismatch',
  ],
  related: ['hreflang-check', 'hreflang-generator', 'country-fit', 'canonical-check'],
  updated: '2026-10-11',
}

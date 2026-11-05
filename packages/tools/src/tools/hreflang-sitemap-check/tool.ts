import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'hreflang-sitemap-check',
  category: 'intl',
  rules: ['hreflang-sitemap-invalid'],
  related: ['hreflang-check', 'hreflang-generator', 'sitemap-check', 'store-hreflang-check'],
  updated: '2026-11-04',
}

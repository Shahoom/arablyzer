import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'shopify-arabic-check',
  category: 'commerce',
  rules: [
    'shopify-locale-mismatch',
    'meta-description-missing',
    'og-tags-missing',
    'product-required-missing',
    'product-offer-invalid',
    'policy-pages-missing',
    'url-slug-invalid',
  ],
  related: ['platform-check', 'hreflang-check', 'language-check'],
  updated: '2026-11-04',
}

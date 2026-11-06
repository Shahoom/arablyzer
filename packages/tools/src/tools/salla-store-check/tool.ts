import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'salla-store-check',
  category: 'commerce',
  rules: [
    'ar-html-lang',
    'rtl-html-dir',
    'meta-description-missing',
    'og-tags-missing',
    'product-required-missing',
    'product-offer-invalid',
    'policy-pages-missing',
    'url-slug-invalid',
  ],
  related: ['platform-check', 'product-schema-check', 'policy-pages-check'],
  updated: '2026-11-04',
}

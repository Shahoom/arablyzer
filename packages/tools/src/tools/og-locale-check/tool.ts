import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'og-locale-check',
  category: 'intl',
  rules: ['og-locale-mismatch'],
  related: ['social-preview', 'og-image-check', 'language-check', 'hreflang-check'],
  updated: '2026-11-04',
}

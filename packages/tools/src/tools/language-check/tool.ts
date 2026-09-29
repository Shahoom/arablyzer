import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'language-check',
  category: 'intl',
  rules: ['ar-html-lang', 'a11y-valid-lang'],
  related: ['rtl-check', 'hreflang-check'],
  updated: '2026-09-29',
}

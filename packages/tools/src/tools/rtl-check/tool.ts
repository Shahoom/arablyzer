import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'rtl-check',
  category: 'rtl',
  rules: ['rtl-html-dir', 'ar-html-lang'],
  related: ['bidi-isolation-check', 'language-check', 'logical-css-check'],
  updated: '2026-09-24',
}

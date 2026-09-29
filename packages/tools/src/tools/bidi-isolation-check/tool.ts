import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'bidi-isolation-check',
  category: 'rtl',
  rules: ['rtl-bidi-isolation'],
  related: ['rtl-check', 'phone-format-check'],
  updated: '2026-09-29',
}

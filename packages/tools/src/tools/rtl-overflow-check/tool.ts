import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'rtl-overflow-check',
  category: 'rtl',
  rules: ['rtl-horizontal-overflow'],
  related: ['logical-css-check', 'rtl-check'],
  updated: '2026-09-29',
}

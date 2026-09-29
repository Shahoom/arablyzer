import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'logical-css-check',
  category: 'rtl',
  rules: ['rtl-physical-css'],
  related: ['rtl-overflow-check', 'mirrored-icons-check'],
  updated: '2026-09-29',
}

import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'carousel-direction-check',
  category: 'rtl',
  rules: ['rtl-icon-role'],
  related: ['mirrored-icons-check', 'rtl-check', 'logical-css-check', 'rtl-overflow-check'],
  updated: '2026-10-11',
}

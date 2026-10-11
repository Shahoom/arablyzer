import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'viewport-check',
  category: 'onpage',
  rules: ['viewport-missing'],
  related: ['rtl-overflow-check', 'rtl-check', 'core-web-vitals', 'title-meta-check'],
  updated: '2026-10-11',
}

import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'arabic-font-slimmer',
  category: 'ar-render',
  rules: ['ar-font-subset-savings'],
  related: ['arabic-font-check', 'font-fallback-check', 'image-weight'],
  updated: '2026-10-04',
}

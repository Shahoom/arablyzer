import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'crux-by-country',
  category: 'speed',
  rules: ['crux-country-gaps'],
  related: ['core-web-vitals', 'image-weight', 'font-fallback-check'],
  updated: '2026-10-04',
}

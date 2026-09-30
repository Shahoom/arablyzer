import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'heading-structure',
  category: 'onpage',
  rules: ['h1-missing'],
  related: ['title-meta-check', 'accessibility-check'],
  updated: '2026-09-29',
}

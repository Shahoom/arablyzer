import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'js-rendering-check',
  category: 'index',
  rules: ['js-only-content'],
  related: ['indexability-check', 'title-meta-check', 'robots-check'],
  updated: '2026-09-29',
}

import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'canonical-check',
  category: 'index',
  rules: ['canonical-conflict'],
  related: ['indexability-check', 'hreflang-check'],
  updated: '2026-09-29',
}

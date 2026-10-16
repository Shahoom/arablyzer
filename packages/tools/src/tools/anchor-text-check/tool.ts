import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'anchor-text-check',
  category: 'links',
  rules: ['anchor-text-generic'],
  related: ['broken-links', 'url-parameters-check', 'heading-structure', 'accessibility-check'],
  updated: '2026-10-11',
}

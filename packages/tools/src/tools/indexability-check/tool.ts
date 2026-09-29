import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'indexability-check',
  category: 'index',
  rules: ['page-noindex', 'canonical-conflict', 'robots-blocks-googlebot'],
  related: ['robots-check', 'canonical-check', 'title-meta-check'],
  updated: '2026-09-29',
}

import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'error-decoder',
  kind: 'paste',
  category: 'general',
  rules: ['page-noindex', 'canonical-conflict'],
  related: [
    'indexability-check',
    'canonical-check',
    'robots-tester',
    'soft-404-check',
    'feed-check',
    'core-web-vitals',
  ],
  updated: '2026-11-04',
}

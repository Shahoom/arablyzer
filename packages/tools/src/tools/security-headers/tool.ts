import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'security-headers',
  category: 'trust',
  rules: [
    'hsts-missing',
    'csp-missing',
    'x-content-type-options-missing',
    'frame-protection-missing',
    'referrer-policy-missing',
  ],
  related: ['mixed-content', 'indexability-check'],
  updated: '2026-09-29',
}

import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'core-web-vitals',
  category: 'speed',
  rules: ['cwv-lcp-poor', 'cwv-inp-poor', 'cwv-cls-poor'],
  related: ['image-weight', 'font-fallback-check', 'redirect-chain-check'],
  updated: '2026-09-29',
}

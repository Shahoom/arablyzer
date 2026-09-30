import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'whatsapp-link-generator',
  kind: 'generator',
  category: 'forms',
  rules: ['whatsapp-link-format'],
  related: ['whatsapp-link-check', 'phone-format-check'],
  updated: '2026-09-29',
}

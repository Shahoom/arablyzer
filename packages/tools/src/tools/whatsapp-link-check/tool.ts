import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'whatsapp-link-check',
  category: 'forms',
  rules: ['whatsapp-link-format'],
  related: ['phone-format-check', 'arabic-form-test'],
  updated: '2026-09-24',
}

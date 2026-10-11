import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'whatsapp-message-check',
  category: 'forms',
  rules: ['whatsapp-link-format', 'whatsapp-text-encoding'],
  related: ['whatsapp-link-check', 'whatsapp-link-generator', 'phone-format-check', 'checkout-form-check'],
  updated: '2026-10-11',
}

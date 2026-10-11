import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'contact-reachability',
  category: 'forms',
  rules: ['contact-link-invalid'],
  related: ['phone-format-check', 'whatsapp-message-check', 'whatsapp-link-check', 'checkout-form-check'],
  updated: '2026-10-11',
}

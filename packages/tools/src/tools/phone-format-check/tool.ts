import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'phone-format-check',
  category: 'forms',
  rules: ['form-phone-direction'],
  related: ['arabic-form-test', 'whatsapp-link-check'],
  updated: '2026-09-29',
}

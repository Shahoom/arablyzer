import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'arabic-checkout-test',
  category: 'forms',
  rules: [
    'form-arabic-name-rejected',
    'form-arabic-digits-rejected',
    'form-address-arabic-rejected',
    'form-autocomplete-missing',
  ],
  related: [
    'arabic-form-test',
    'phone-format-check',
    'whatsapp-link-check',
    'payment-methods-detector',
  ],
  updated: '2026-10-11',
}

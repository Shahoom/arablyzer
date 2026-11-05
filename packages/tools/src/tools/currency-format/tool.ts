import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'currency-format',
  category: 'locale',
  rules: ['currency-forms-mixed'],
  related: [
    'price-format-check',
    'digits-consistency',
    'number-format',
    'payment-methods-detector',
  ],
  updated: '2026-11-04',
}

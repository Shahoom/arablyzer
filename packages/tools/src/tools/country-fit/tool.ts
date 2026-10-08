import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'country-fit',
  category: 'locale',
  rules: ['country-fit', 'sar-sign-font', 'dialect-register'],
  related: ['price-format-check', 'phone-format-check', 'digits-consistency'],
  updated: '2026-10-04',
}

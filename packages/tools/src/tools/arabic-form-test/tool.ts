import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'arabic-form-test',
  category: 'forms',
  rules: ['form-arabic-name-rejected', 'form-arabic-digits-rejected', 'form-label-missing'],
  related: ['phone-format-check', 'accessibility-check'],
  updated: '2026-09-29',
}

import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'accessibility-check',
  category: 'trust',
  rules: [
    'a11y-button-name',
    'a11y-color-contrast',
    'a11y-color-contrast-review',
    'a11y-image-alt',
    'a11y-link-name',
    'a11y-valid-lang',
  ],
  related: ['arabic-form-test', 'heading-structure'],
  updated: '2026-09-29',
}

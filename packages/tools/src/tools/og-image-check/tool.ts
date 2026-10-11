import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'og-image-check',
  category: 'general',
  rules: ['og-image-invalid', 'og-tags-missing'],
  related: ['social-preview', 'title-meta-check', 'whatsapp-message-check', 'canonical-check'],
  updated: '2026-10-11',
}

import { defineTool } from '../../tool'

export const tool = defineTool({
  slug: 'whatsapp-link-check',
  category: 'forms',
  rules: ['whatsapp-link-format'],
  related: ['rtl-check'],
  updated: '2026-09-24',
})

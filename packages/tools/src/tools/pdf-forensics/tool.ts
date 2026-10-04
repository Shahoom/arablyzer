import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'pdf-forensics',
  category: 'ar-content',
  rules: ['pdf-arabic-text', 'pdf-metadata'],
  related: ['arabic-shaping-check', 'ai-training-filter', 'accessibility-check'],
  updated: '2026-10-04',
}

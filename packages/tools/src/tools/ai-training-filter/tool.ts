import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'ai-training-filter',
  category: 'ai',
  rules: ['ai-training-filters'],
  related: ['ai-crawler-check', 'ai-access', 'arabic-shaping-check'],
  updated: '2026-10-04',
}

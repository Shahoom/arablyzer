import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'ai-visibility',
  category: 'ai',
  rules: ['ai-visibility-gap'],
  related: ['ai-crawler-check', 'ai-access', 'ai-training-filter'],
  updated: '2026-10-04',
}

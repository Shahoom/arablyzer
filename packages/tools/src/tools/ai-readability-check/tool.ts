import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'ai-readability-check',
  category: 'ai',
  rules: ['ar-ai-readability'],
  related: ['ai-crawler-check', 'ai-access', 'tatweel-check', 'digits-consistency'],
  updated: '2026-10-11',
}

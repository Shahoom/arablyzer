import type { ToolDefinition } from '../../tool'

export const definition: ToolDefinition = {
  slug: 'ai-access',
  category: 'ai',
  rules: ['robots-blocks-ai-search', 'bot-challenge'],
  related: ['ai-crawler-check', 'robots-check', 'indexability-check'],
  updated: '2026-09-29',
}

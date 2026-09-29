import type { ToolDefinition } from './tool'
import { definition as aiCrawlerCheck } from './tools/ai-crawler-check/tool'
import { definition as rtlCheck } from './tools/rtl-check/tool'
import { definition as whatsappLinkCheck } from './tools/whatsapp-link-check/tool'

/**
 * Every tool without its page's copy, sorted by slug: what the API checks a tool's slug against,
 * and what the scanner reads a tool's rules from, neither of which reads the copy files.
 */
export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  aiCrawlerCheck,
  rtlCheck,
  whatsappLinkCheck,
]

export function toolDefinition(slug: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((tool) => tool.slug === slug)
}

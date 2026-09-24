import type { Tool } from './tool'
import { tool as aiCrawlerCheck } from './tools/ai-crawler-check/tool'
import { tool as rtlCheck } from './tools/rtl-check/tool'
import { tool as whatsappLinkCheck } from './tools/whatsapp-link-check/tool'

/** Every tool, sorted by slug. */
export const TOOLS: readonly Tool[] = [aiCrawlerCheck, rtlCheck, whatsappLinkCheck]

export function toolBySlug(slug: string): Tool | undefined {
  return TOOLS.find((tool) => tool.slug === slug)
}

export {
  loadToolCopy,
  parseToolCopy,
  TOOL_HEADINGS,
  type CodeExample,
  type FaqEntry,
  type Lang,
  type ToolCopy,
} from './copy'
export {
  defineTool,
  TOOL_CATEGORIES,
  type Tool,
  type ToolCategory,
  type ToolDefinition,
} from './tool'

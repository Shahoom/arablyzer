import { TOOL_DEFINITIONS } from './registry'
import { defineTool, type Tool } from './tool'

/** Every tool with its page's copy, sorted by slug. */
export const TOOLS: readonly Tool[] = TOOL_DEFINITIONS.map(defineTool)

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
export { locationOf, parseHttpExample, REDIRECT_STATUSES, type HttpResponse } from './http'
export { TOOL_DEFINITIONS, toolDefinition } from './registry'
export {
  defineTool,
  TOOL_CATEGORIES,
  TOOL_KINDS,
  type ToolKind,
  type Tool,
  type ToolCategory,
  type ToolDefinition,
} from './tool'

import { scan, type ScanOptions } from '@arablyzer/engine'
import { RULES, type CollectorId } from '@arablyzer/rules'
import type { Scanner } from '@arablyzer/scanner-client'
import { toolDefinition } from '@arablyzer/tools/registry'
import { eventOf } from './events'

/** The engine in this process, with its options: the scanner's own, and `pnpm dev`'s. */
export function localScanner(options: ScanOptions): Scanner {
  return (request, onEvent, signal) =>
    scan(request.url, {
      ...optionsFor(options, request.tool),
      ...(signal === undefined ? {} : { signal }),
      onProgress: (progress) => {
        onEvent(eventOf(progress))
      },
    })
}

/**
 * A tool page's scan runs the tool's rules alone (M2.2): a browser only when one of them reads
 * the rendered page, CrUX or Safe Browsing only when one reads them (the page's URL goes to Google),
 * and no lab metrics, which the whole scan's report shows. Without a tool, the options as they
 * are.
 */
export function optionsFor(options: ScanOptions, tool: string | undefined): ScanOptions {
  if (tool === undefined) return options
  const definition = toolDefinition(tool)
  if (definition === undefined) throw new Error(`There is no tool ${tool}`)
  const reads = (need: CollectorId) =>
    (options.rules ?? RULES).some(
      (rule) => definition.rules.includes(rule.id) && rule.needs.includes(need),
    )
  const renders = reads('render')
  if (renders && options.render === undefined) {
    throw new Error(`The ${tool} tool renders the page, and this scanner runs no browser`)
  }
  const tooled: { -readonly [K in keyof ScanOptions]: ScanOptions[K] } = {
    ...options,
    ruleIds: definition.rules,
  }
  delete tooled.lab
  if (!renders) delete tooled.render
  if (!reads('crux')) delete tooled.crux
  if (!reads('safe-browsing')) delete tooled.safeBrowsing
  if (!reads('knowledge-graph')) delete tooled.knowledgeGraph
  return tooled
}

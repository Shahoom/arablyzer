import { renderPdf } from '@arablyzer/browser'
import { createCrawler, scan, type Crawler, type ScanOptions } from '@arablyzer/engine'
import { renderHtml } from '@arablyzer/pdf'
import type { PdfDocument } from '@arablyzer/pdf/model'
import { OUTSIDE, RULES, type CollectorId } from '@arablyzer/rules'
import type { CrawlClient, Scanner } from '@arablyzer/scanner-client'
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
  else if (tooled.render?.xray === true) tooled.render = { ...tooled.render, xray: false }
  if (!reads('crux')) delete tooled.crux
  if (!reads('safe-browsing')) delete tooled.safeBrowsing
  if (!reads('knowledge-graph')) delete tooled.knowledgeGraph
  // The services beside the site are asked only for a tool whose rule reads one.
  if (!(Object.keys(OUTSIDE) as CollectorId[]).some(reads)) delete tooled.outside
  delete tooled.openPageRank
  return tooled
}

/**
 * The engine's crawler in this process, with the scan's egress rules and the thread that reads a
 * page's HTML where the scanner reads it (M4.5): no browser, and nothing the scan's keys are for.
 */
export function localCrawler(options: ScanOptions): Crawler {
  return createCrawler({
    ...(options.policy === undefined ? {} : { policy: options.policy }),
    ...(options.resolver === undefined ? {} : { resolver: options.resolver }),
    ...(options.isolateParse === undefined ? {} : { isolateParse: options.isolateParse }),
  })
}

/** The crawler in this process, in the shape the API's crawler asks for: `pnpm dev`, where the scanner is not a service. */
export function localCrawlClient(options: ScanOptions): CrawlClient {
  const crawler = localCrawler(options)
  return {
    page: async (url, pageOptions = {}) => {
      const result = await crawler.page(url, pageOptions)
      return { ...result, links: [...result.links], issues: result.issues.map((i) => ({ ...i })) }
    },
    seeds: async (origin, signal) => {
      const result = await crawler.seeds(origin, signal)
      return { ...result, urls: [...result.urls] }
    },
  }
}

/** Draws a PDF in this process's Chromium (M4.7): the document becomes a page, the page a file. */
export function localPdf(): (document: PdfDocument, signal: AbortSignal) => Promise<Uint8Array> {
  return (document, signal) => renderPdf(renderHtml(document), { signal })
}

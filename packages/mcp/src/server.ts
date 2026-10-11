import { V1_ENGINES } from '@arablyzer/api-contract'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  ApiError,
  type ApiClient,
  type Rule,
  type RuleDetail,
  type Scan,
  type Tool,
} from './client'
import { summarize } from './summary'

export interface McpOptions {
  readonly client: ApiClient
  /** Waits between two looks at a scan; a timer by default (tests pass their own). */
  readonly sleep?: (ms: number) => Promise<void>
  /** The clock `wait_seconds` is counted on. */
  readonly now?: () => number
  /** The version the server reports. */
  readonly version?: string
}

export const MCP_SERVER_NAME = 'arablyzer'
/** How long a tool call waits for a scan by default, and the most it may be asked to. */
export const DEFAULT_WAIT_SECONDS = 45
export const MAX_WAIT_SECONDS = 120
const FIRST_POLL_MS = 1_500
const LAST_POLL_MS = 5_000
const DEFAULT_ISSUES = 15
const PAGE = 100

const INSTRUCTIONS = [
  'Arablyzer checks web pages, Arabic and Gulf sites in particular: cross-engine rendering (Chromium, Firefox, WebKit), Arabic fonts, RTL, forms, SEO, accessibility, security headers and more.',
  'Use scan_page to check a page and get its score and worst problems; use run_tool for one focused check (list_tools names them); use get_report for a scan you started earlier.',
  'The rule library is a set of resources (arablyzer://rules/en/<rule-id> and arablyzer://rules/ar/<rule-id>) that explain why a problem matters and how to fix it: read the one a finding names.',
  'Scans use the key holder’s own quota and only reach public sites.',
].join('\n')

const wait = z
  .number()
  .int()
  .min(0)
  .max(MAX_WAIT_SECONDS)
  .optional()
  .describe(
    `How long to wait for the scan to finish, in seconds (default ${String(DEFAULT_WAIT_SECONDS)}, at most ${String(MAX_WAIT_SECONDS)}). If it has not finished, the answer says so and gives the scan id for get_report.`,
  )
const issues = z
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .describe(`How many distinct problems to list, worst first (default ${String(DEFAULT_ISSUES)}).`)

interface Result {
  [key: string]: unknown
  content: { type: 'text'; text: string }[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

const ok = (value: Record<string, unknown>): Result => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  structuredContent: value,
})

/** A failure the model can act on: the API's own words, never a stack trace. */
const failed = (error: unknown): Result => {
  const known = error instanceof ApiError
  const code = known ? error.code : 'unavailable'
  const message = known ? error.message : 'The request failed.'
  const hint =
    code === 'rate_limited'
      ? ' The account’s scan allowance is used up for now; try again later.'
      : code === 'plan_limit'
        ? ' The account’s plan does not allow this.'
        : ''
  return {
    isError: true,
    content: [{ type: 'text', text: `${code}: ${message}${hint}` }],
    structuredContent: {
      error: { code, message, ...(known && error.details ? { details: error.details } : {}) },
    },
  }
}

const DONE: ReadonlySet<Scan['state']> = new Set(['complete', 'partial', 'failed'])

export function createMcpServer(options: McpOptions): McpServer {
  const { client } = options
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const now = options.now ?? (() => Date.now())
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: options.version ?? '0.1.0' },
    { instructions: INSTRUCTIONS },
  )

  /** The scan once it ends, or as it is when the wait is over. */
  async function until(scan: Scan, seconds: number): Promise<Scan> {
    const deadline = now() + seconds * 1000
    let current = scan
    let pause = FIRST_POLL_MS
    while (!DONE.has(current.state) && now() + pause <= deadline) {
      await sleep(pause)
      current = await client.getScan(scan.id)
      pause = Math.min(Math.round(pause * 1.5), LAST_POLL_MS)
    }
    return current
  }

  /** The answer for a scan: its summary when it ended, or where it is when the wait was not enough. */
  async function answer(
    scan: Scan,
    seconds: number,
    maxIssues: number,
    extra: Record<string, unknown> = {},
  ) {
    const current = await until(scan, seconds)
    if (current.state === 'failed') {
      return failed(
        new ApiError(
          'scan_failed',
          'The scan failed and has no report. The page may be unreachable; try again.',
          502,
        ),
      )
    }
    if (!DONE.has(current.state)) {
      return ok({
        ...extra,
        scanId: current.id,
        url: current.url,
        state: current.state,
        message: 'The scan has not finished. Call get_report with this scanId in a moment.',
        reportPage: current.links.page,
      })
    }
    return ok({ ...extra, ...summarize(current, await client.getReport(current.id), maxIssues) })
  }

  server.registerTool(
    'scan_page',
    {
      title: 'Scan a page',
      description:
        'Checks one web page with every Arablyzer rule (rendering in three browsers, Arabic text, RTL, SEO, accessibility, security, speed) and returns its score, counts and the worst problems with where they are. Takes about half a minute. The same page scanned again within ten minutes returns the earlier scan. Uses one of the account’s scans.',
      inputSchema: {
        url: z.string().min(1).describe('The page: an http or https address of a public site.'),
        engines: z
          .array(z.enum(V1_ENGINES))
          .min(1)
          .optional()
          .describe(
            'Render in these browsers only (default: all three). A scan on fewer is a one-off that is not kept in the account’s history.',
          ),
        wait_seconds: wait,
        max_issues: issues,
      },
      annotations: {
        title: 'Scan a page',
        readOnlyHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ url, engines, wait_seconds, max_issues }) => {
      try {
        const started = await client.startScan(url, engines)
        return await answer(
          started,
          wait_seconds ?? DEFAULT_WAIT_SECONDS,
          max_issues ?? DEFAULT_ISSUES,
          {
            reusedEarlierScan: started.reused,
          },
        )
      } catch (error) {
        return failed(error)
      }
    },
  )

  server.registerTool(
    'get_report',
    {
      title: 'Get a scan’s report',
      description:
        'The summary of a scan started earlier (by scan_page, run_tool or the website): score, counts, and the worst problems. If the scan is still running, waits a little.',
      inputSchema: {
        scan_id: z.string().min(1).describe('The scanId a scan_page or run_tool answer gave.'),
        wait_seconds: wait,
        max_issues: issues,
      },
      annotations: { title: 'Get a scan’s report', readOnlyHint: true, openWorldHint: false },
    },
    async ({ scan_id, wait_seconds, max_issues }) => {
      try {
        const scan = await client.getScan(scan_id)
        return await answer(
          scan,
          wait_seconds ?? DEFAULT_WAIT_SECONDS,
          max_issues ?? DEFAULT_ISSUES,
        )
      } catch (error) {
        return failed(error)
      }
    },
  )

  server.registerTool(
    'run_tool',
    {
      title: 'Run one check on a page',
      description:
        'Runs a single focused tool (its rules alone) on a page, such as robots-check or arabic-shaping-check, and returns the same kind of summary as scan_page. Faster and narrower than a whole scan. list_tools names the tools. Uses one of the account’s scans.',
      inputSchema: {
        tool: z.string().min(1).describe('The tool’s slug, from list_tools.'),
        url: z.string().min(1).describe('The page: an http or https address of a public site.'),
        wait_seconds: wait,
        max_issues: issues,
      },
      annotations: { title: 'Run one check on a page', readOnlyHint: false, openWorldHint: true },
    },
    async ({ tool, url, wait_seconds, max_issues }) => {
      try {
        const started = await client.runTool(tool, url)
        return await answer(
          started,
          wait_seconds ?? DEFAULT_WAIT_SECONDS,
          max_issues ?? DEFAULT_ISSUES,
          { tool },
        )
      } catch (error) {
        return failed(error)
      }
    },
  )

  server.registerTool(
    'list_tools',
    {
      title: 'List the tools',
      description:
        'The single-purpose checks run_tool takes: slug, what it checks, and whether it can run on a page. Filter with a word.',
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe(
            'Only tools whose slug, title, summary or category contains this (case does not matter).',
          ),
        runnable_only: z
          .boolean()
          .optional()
          .describe('Only tools run_tool can run (default true).'),
      },
      annotations: { title: 'List the tools', readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, runnable_only }) => {
      try {
        const all = await everything<Tool>((cursor) => client.listTools(PAGE, cursor))
        const needle = query?.trim().toLowerCase() ?? ''
        const tools = all
          .filter((tool) => runnable_only === false || tool.runnable)
          .filter(
            (tool) =>
              needle === '' ||
              [
                tool.slug,
                tool.category,
                tool.title.en,
                tool.title.ar,
                tool.summary.en,
                tool.summary.ar,
              ]
                .join('\n')
                .toLowerCase()
                .includes(needle),
          )
          .map((tool) => ({
            slug: tool.slug,
            category: tool.category,
            runnable: tool.runnable,
            title: tool.title,
            summary: tool.summary,
          }))
        return ok({ count: tools.length, tools })
      } catch (error) {
        return failed(error)
      }
    },
  )

  // The rule library as resources: one per rule and language, and an index.
  const ruleList = async (): Promise<readonly Rule[]> =>
    everything<Rule>((cursor) => client.listRules(PAGE, cursor))

  server.registerResource(
    'rules-index',
    'arablyzer://rules',
    {
      title: 'The rule library',
      description:
        'Every rule Arablyzer checks: id, category, severity and title in Arabic and English.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(await ruleList(), null, 2),
        },
      ],
    }),
  )

  server.registerResource(
    'rule',
    new ResourceTemplate('arablyzer://rules/{lang}/{id}', {
      list: async () => ({
        resources: (await ruleList()).flatMap((rule) =>
          (['en', 'ar'] as const).map((lang) => ({
            uri: `arablyzer://rules/${lang}/${rule.id}`,
            name: `${rule.id} (${lang})`,
            title: rule.title[lang],
            mimeType: 'text/markdown',
          })),
        ),
      }),
      complete: {
        lang: () => ['en', 'ar'],
        id: async (value) =>
          (await ruleList()).map((rule) => rule.id).filter((id) => id.startsWith(value)),
      },
    }),
    {
      title: 'A rule, explained',
      description:
        'Why a rule matters, how to fix it and how it is detected, in Arabic (ar) or English (en).',
      mimeType: 'text/markdown',
    },
    async (uri, variables) => {
      const lang = variables.lang === 'ar' ? 'ar' : variables.lang === 'en' ? 'en' : null
      const id = Array.isArray(variables.id) ? variables.id[0] : variables.id
      if (lang === null || id === undefined)
        throw new ApiError('not_found', 'A rule is arablyzer://rules/<en|ar>/<rule-id>.', 404)
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text: ruleMarkdown(await client.getRule(id), lang),
          },
        ],
      }
    },
  )

  return server
}

/** Every page of a list, up to a bound that no list of ours reaches. */
async function everything<T>(
  page: (cursor?: string) => Promise<{ data: readonly T[]; nextCursor: string | null }>,
): Promise<T[]> {
  const items: T[] = []
  let cursor: string | undefined
  for (let pages = 0; pages < 20; pages++) {
    const next = await page(cursor)
    items.push(...next.data)
    if (next.nextCursor === null) break
    cursor = next.nextCursor
  }
  return items
}

/** A rule's explanation in one language as Markdown. */
export function ruleMarkdown(rule: RuleDetail, lang: 'ar' | 'en'): string {
  const copy = rule.copy[lang]
  const labels =
    lang === 'ar'
      ? { why: 'لماذا يهم', fix: 'كيف تُصلح', detect: 'كيف نكشف', refs: 'المراجع' }
      : { why: 'Why it matters', fix: 'How to fix', detect: 'How we detect', refs: 'References' }
  return [
    `# ${copy.title}`,
    '',
    `\`${rule.id}\` · ${rule.severity} · ${rule.category}${rule.wcag === null ? '' : ` · WCAG ${rule.wcag.join(', ')}`}`,
    '',
    `## ${labels.why}`,
    '',
    copy.why,
    '',
    `## ${labels.fix}`,
    '',
    copy.fix,
    '',
    `## ${labels.detect}`,
    '',
    copy.detect,
    '',
    `## ${labels.refs}`,
    '',
    copy.references,
    '',
  ].join('\n')
}

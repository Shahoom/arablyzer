import { z } from 'zod'
import {
  API_V1_PATH,
  RunToolRequest,
  StartScanRequest,
  V1Error,
  V1ListMeta,
  V1Rule,
  V1RuleDetail,
  V1Scan,
  V1ScanStarted,
  V1Tool,
  V1_PAGE_DEFAULT,
  V1_PAGE_MAX,
} from './v1'

// The OpenAPI 3.1 document of /api/v1 (M5.1), built from the schemas in v1.ts and the report's own
// JSON Schema. A test lists the API's routes and this document's paths both ways, so a route
// cannot ship undocumented.

type Json = Record<string, unknown>

export interface OpenApiOptions {
  /** The report's JSON Schema (draft 2020-12), from `@arablyzer/report-schema`. */
  readonly reportSchema: Json
  /** The site's origin, where the API is; left out, the document's server is relative. */
  readonly server?: string
  readonly version?: string
}

/** A schema as a component: a named schema (`meta.id`) comes back as itself, its definitions beside it. */
function schemaOf(schema: z.ZodType, hoisted: Record<string, Json>): Json {
  const made = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io: 'output',
    unrepresentable: 'any',
  }) as Json & { $defs?: Record<string, Json> }
  // The dialect belongs to the document, not to each schema in it.
  const { $defs, ...main } = Object.fromEntries(
    Object.entries(made).filter(([key]) => key !== '$schema'),
  ) as Json & { $defs?: Record<string, Json> }
  const local = (value: unknown): Json =>
    JSON.parse(JSON.stringify(value).replaceAll('"#/$defs/', '"#/components/schemas/')) as Json
  for (const [name, definition] of Object.entries($defs ?? {})) hoisted[name] = local(definition)
  const own = typeof main.$ref === 'string' ? /^#\/\$defs\/(.+)$/.exec(main.$ref)?.[1] : undefined
  if (own !== undefined && hoisted[own] !== undefined) {
    const found = hoisted[own]
    Reflect.deleteProperty(hoisted, own)
    return found
  }
  return local(main)
}

const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` })
const body = (schema: Json): Json => ({
  required: true,
  content: { 'application/json': { schema } },
})
const answer = (description: string, schema: Json, headers: readonly string[] = RATE): Json => ({
  description,
  headers: Object.fromEntries(
    headers.map((name) => [name, { $ref: `#/components/headers/${name}` }]),
  ),
  content: { 'application/json': { schema } },
})
const envelope = (data: Json): Json => ({
  type: 'object',
  required: ['data'],
  additionalProperties: false,
  properties: { data },
})
const list = (item: Json): Json => ({
  type: 'object',
  required: ['data', 'meta'],
  additionalProperties: false,
  properties: { data: { type: 'array', items: item }, meta: ref('ListMeta') },
})
const failure = (name: string): Json => ({ $ref: `#/components/responses/${name}` })
const param = (name: string): Json => ({ $ref: `#/components/parameters/${name}` })

const RATE = ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'] as const
const SCANS = [...RATE, 'X-Scans-Limit', 'X-Scans-Remaining'] as const

/** The refusals a route may give, by the names of `components.responses`. */
const COMMON = ['Unauthorized', 'RateLimited', 'Unavailable'] as const

function operation(o: {
  id: string
  tag: string
  summary: string
  description: string
  params?: readonly string[]
  body?: Json
  ok: Json
  refusals?: readonly string[]
}): Json {
  return {
    operationId: o.id,
    tags: [o.tag],
    summary: o.summary,
    description: o.description,
    security: [{ bearerAuth: [] }],
    ...(o.params === undefined ? {} : { parameters: o.params.map(param) }),
    ...(o.body === undefined ? {} : { requestBody: o.body }),
    responses: {
      ...o.ok,
      ...Object.fromEntries(
        [...(o.refusals ?? []), ...COMMON].map((name) => [STATUS_OF[name], failure(name)]),
      ),
    },
  }
}

const STATUS_OF: Readonly<Record<string, string>> = {
  BadRequest: '400',
  Unauthorized: '401',
  PlanLimit: '403',
  NotFound: '404',
  NotReady: '409',
  Blocked: '422',
  RateLimited: '429',
  Unavailable: '503',
}

const FAILURES: Readonly<Record<string, string>> = {
  BadRequest: 'The request is not what the route takes (`invalid_request`, `invalid_url`).',
  Unauthorized: 'No key, or a key that is malformed, unknown or revoked (`unauthorized`).',
  PlanLimit: 'The account’s plan allows no more of this (`plan_limit`; `details.limit` names it).',
  NotFound: 'There is no such scan, tool or rule (`not_found`).',
  NotReady:
    'The scan has no report yet, or never will (`report_not_ready`; `details.state` says where it is).',
  Blocked: 'The address is a place scans never reach (`blocked_target`).',
  RateLimited: 'A limit was reached (`rate_limited`); `Retry-After` says when to try again.',
  Unavailable: 'The service, or accounts, are off (`unavailable`, `accounts_off`).',
}

export function buildOpenApi(options: OpenApiOptions): Json {
  const hoisted: Record<string, Json> = {}
  const { $defs, ...report } = options.reportSchema as Json & { $defs?: Record<string, Json> }
  // The report's own definitions become components, so that every `$ref` still resolves.
  const rename = (value: unknown): unknown =>
    JSON.parse(JSON.stringify(value).replaceAll('"#/$defs/', '"#/components/schemas/Report.'))
  const reportBody = Object.fromEntries(Object.entries(report).filter(([key]) => key !== '$schema'))
  const listQuery = ['limit', 'cursor']
  const paths: Record<string, Json> = {
    [`${API_V1_PATH}/scans`]: {
      post: operation({
        id: 'startScan',
        tag: 'Scans',
        summary: 'Start a scan',
        description:
          'Starts a whole-page scan of the address, or returns the account’s own scan of the same page made in the last ten minutes (`reused: true`, no quota used). Read its state with `getScan` and its report with `getReport`. A new scan takes one scan from the account’s quota, the same one the website uses.',
        body: body(ref('StartScanRequest')),
        ok: {
          '202': answer('The scan is queued.', envelope(ref('ScanStarted')), SCANS),
          '200': answer(
            'The same page was scanned a moment ago; that scan is returned.',
            envelope(ref('ScanStarted')),
          ),
        },
        refusals: ['BadRequest', 'PlanLimit', 'Blocked'],
      }),
      get: operation({
        id: 'listScans',
        tag: 'Scans',
        summary: 'List the account’s scans',
        description:
          'The scans made while signed in or with a key, newest first. Scans of chosen engines and tool runs are not kept here.',
        params: listQuery,
        ok: { '200': answer('A page of scans.', list(ref('Scan'))) },
        refusals: ['BadRequest'],
      }),
    },
    [`${API_V1_PATH}/scans/{id}`]: {
      get: operation({
        id: 'getScan',
        tag: 'Scans',
        summary: 'Get a scan’s state',
        description: 'Poll this until `state` is `complete`, `partial` or `failed`.',
        params: ['scanId'],
        ok: { '200': answer('The scan.', envelope(ref('Scan'))) },
        refusals: ['NotFound'],
      }),
    },
    [`${API_V1_PATH}/scans/{id}/report`]: {
      get: operation({
        id: 'getReport',
        tag: 'Scans',
        summary: 'Get a scan’s report',
        description:
          'The report, in the schema the command line and the website use (`schemaVersion` in the report). 409 until the scan has finished.',
        params: ['scanId'],
        ok: { '200': answer('The report.', envelope(ref('Report'))) },
        refusals: ['NotFound', 'NotReady'],
      }),
    },
    [`${API_V1_PATH}/tools`]: {
      get: operation({
        id: 'listTools',
        tag: 'Tools',
        summary: 'List the tools',
        description: 'The single-purpose checks, sorted by slug.',
        params: listQuery,
        ok: { '200': answer('A page of tools.', list(ref('Tool'))) },
        refusals: ['BadRequest'],
      }),
    },
    [`${API_V1_PATH}/tools/{slug}/runs`]: {
      post: operation({
        id: 'runTool',
        tag: 'Tools',
        summary: 'Run one tool on a page',
        description:
          'Starts a scan that runs the tool’s rules alone. It takes one scan from the account’s quota. Read it with `getScan` and `getReport`. A tool’s scan is not kept in the account history.',
        params: ['toolSlug'],
        body: body(ref('RunToolRequest')),
        ok: { '202': answer('The scan is queued.', envelope(ref('ScanStarted')), SCANS) },
        refusals: ['BadRequest', 'NotFound', 'PlanLimit', 'Blocked'],
      }),
    },
    [`${API_V1_PATH}/rules`]: {
      get: operation({
        id: 'listRules',
        tag: 'Rules',
        summary: 'List the rules',
        description: 'The rule library: what a scan checks, by id.',
        params: listQuery,
        ok: { '200': answer('A page of rules.', list(ref('Rule'))) },
        refusals: ['BadRequest'],
      }),
    },
    [`${API_V1_PATH}/rules/{ruleId}`]: {
      get: operation({
        id: 'getRule',
        tag: 'Rules',
        summary: 'Get a rule with its explanation',
        description:
          'Why the rule matters, how to fix it and how it is detected, in Arabic and English.',
        params: ['ruleId'],
        ok: { '200': answer('The rule.', envelope(ref('RuleDetail'))) },
        refusals: ['NotFound'],
      }),
    },
    [`${API_V1_PATH}/openapi.json`]: {
      get: {
        operationId: 'getOpenApi',
        tags: ['Meta'],
        summary: 'This document',
        description: 'The OpenAPI 3.1 description of the API. No key needed.',
        security: [],
        responses: {
          '200': {
            description: 'The document.',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
        },
      },
    },
  }

  const header = (description: string, type: 'integer'): Json => ({
    description,
    schema: { type },
  })
  const reportComponents: Record<string, Json> = Object.fromEntries(
    Object.entries($defs ?? {}).map(([name, schema]) => [`Report.${name}`, rename(schema) as Json]),
  )
  return {
    openapi: '3.1.0',
    info: {
      title: 'Arablyzer API',
      version: options.version ?? '1.0.0',
      summary: 'Scans, reports, tools and rules for Arabic and Gulf websites.',
      description:
        'Scan a page, read its report, run a single tool, and read the rule library. Authenticate with an API key from the account page: `Authorization: Bearer arb_…`. Scans use the account’s own quota; the API adds no second allowance. Without accounts enabled every route answers 503 `accounts_off`.',
      license: { name: 'AGPL-3.0-only', identifier: 'AGPL-3.0-only' },
    },
    ...(options.server === undefined ? {} : { servers: [{ url: options.server }] }),
    tags: [{ name: 'Scans' }, { name: 'Tools' }, { name: 'Rules' }, { name: 'Meta' }],
    security: [{ bearerAuth: [] }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'An API key: `arb_` and 43 characters.',
        },
      },
      schemas: {
        StartScanRequest: schemaOf(StartScanRequest, hoisted),
        RunToolRequest: schemaOf(RunToolRequest, hoisted),
        Scan: schemaOf(V1Scan, hoisted),
        ScanStarted: schemaOf(V1ScanStarted, hoisted),
        Tool: schemaOf(V1Tool, hoisted),
        Rule: schemaOf(V1Rule, hoisted),
        RuleDetail: schemaOf(V1RuleDetail, hoisted),
        ListMeta: schemaOf(V1ListMeta, hoisted),
        Error: schemaOf(V1Error, hoisted),
        Report: rename(reportBody) as Json,
        ...reportComponents,
        ...hoisted,
      },
      parameters: {
        scanId: {
          name: 'id',
          in: 'path',
          required: true,
          description: 'The scan’s id.',
          schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{22}$' },
        },
        toolSlug: {
          name: 'slug',
          in: 'path',
          required: true,
          description: 'The tool’s slug.',
          schema: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 64 },
        },
        ruleId: {
          name: 'ruleId',
          in: 'path',
          required: true,
          description: 'The rule’s id.',
          schema: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
        },
        limit: {
          name: 'limit',
          in: 'query',
          description: 'How many to return.',
          schema: { type: 'integer', minimum: 1, maximum: V1_PAGE_MAX, default: V1_PAGE_DEFAULT },
        },
        cursor: {
          name: 'cursor',
          in: 'query',
          description: 'The `meta.nextCursor` of the page before.',
          schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,16}$' },
        },
      },
      headers: {
        'RateLimit-Limit': header('Requests the key may make per minute.', 'integer'),
        'RateLimit-Remaining': header('Requests left in the minute’s budget.', 'integer'),
        'RateLimit-Reset': header('Seconds until the request budget is full again.', 'integer'),
        'X-Scans-Limit': header('Scans the account’s window allows.', 'integer'),
        'X-Scans-Remaining': header(
          'Scans left in the account’s window after this one.',
          'integer',
        ),
      },
      responses: Object.fromEntries(
        Object.entries(FAILURES).map(([name, description]) => [
          name,
          { description, content: { 'application/json': { schema: ref('Error') } } },
        ]),
      ),
    },
  }
}

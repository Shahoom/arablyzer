import { MCP_PATH } from '@arablyzer/api-contract'
import { createApiClient, handleMcpRequest } from '@arablyzer/mcp'
import type { Context, Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { PROXY_SECRET_HEADER } from './proxy-secret'
import type { Live } from './v1/routes'

export interface McpDeps {
  /** The API's own key check (v1/routes.ts): the account, or the answer to send. */
  readonly gate: (c: Context) => Promise<Live | Response>
  /** Where the MCP server's calls go: the API itself, in this process. */
  readonly api: (request: Request, env: unknown) => Response | Promise<Response>
}

/** An MCP request is a few KB of JSON-RPC; nothing larger is read. */
const MAX_BODY_BYTES = 64 * 1024
const BEARER = /^Bearer +([^ ]+)$/i
/** Not an address anyone resolves: the calls never leave the process. */
const INTERNAL = 'http://arablyzer.internal'

/**
 * The Model Context Protocol endpoint (M5.1): `POST /mcp`, stateless streamable HTTP, answered in
 * JSON. The caller's API key opens it as it opens /api/v1, and the MCP server it gets calls the
 * public API with that same key, in this process: every limit, quota and egress rule of the API
 * applies, because there is no other way for it to reach a scan.
 */
export function mountMcp(app: Hono, deps: McpDeps): void {
  app.all(
    MCP_PATH,
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) =>
        c.json({ error: { code: 'invalid_request', message: 'The body is too large.' } }, 400),
    }),
    async (c) => {
      const gated = await deps.gate(c)
      if (gated instanceof Response) return gated
      const key = BEARER.exec(c.req.header('authorization') ?? '')?.[1] ?? ''
      // What the API reads the visitor's address from, passed on so a scan is counted by it.
      const forwarded: Record<string, string> = {}
      for (const name of ['x-forwarded-for', PROXY_SECRET_HEADER]) {
        const value = c.req.header(name)
        if (value !== undefined) forwarded[name] = value
      }
      return handleMcpRequest(c.req.raw, {
        client: createApiClient({
          baseUrl: INTERNAL,
          apiKey: key,
          headers: forwarded,
          fetcher: async (input, init) => deps.api(new Request(input, init), c.env),
        }),
      })
    },
  )
}

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createMcpServer, type McpOptions } from './server'

/**
 * One MCP request over streamable HTTP, answered in JSON: stateless, so a server is made for the
 * request and closed after it, and nothing is kept between calls (no session, so any process of the
 * API can answer any call).
 */
export async function handleMcpRequest(request: Request, options: McpOptions): Promise<Response> {
  // Nothing is kept between calls, so there is no stream to listen on and no session to end.
  if (request.method !== 'POST') {
    return Response.json(
      {
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed: POST JSON-RPC to this endpoint.' },
        id: null,
      },
      { status: 405, headers: { Allow: 'POST' } },
    )
  }
  const server = createMcpServer(options)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  try {
    return await transport.handleRequest(request)
  } finally {
    await server.close()
  }
}

import { describe, expect, it } from 'vitest'
import { handleMcpRequest } from '../src/index'
import { fakeClient } from './fixtures'

const call = (body: unknown, method = 'POST') =>
  handleMcpRequest(
    new Request('https://arablyzer.example/mcp', {
      method,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    }),
    { client: fakeClient(), sleep: () => Promise.resolve() },
  )

describe('MCP over streamable HTTP', () => {
  it('answers initialize, tools/list and tools/call as JSON, with no session', async () => {
    const init = await call({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 't', version: '1' },
      },
    })
    expect(init.status).toBe(200)
    expect(init.headers.get('content-type')).toContain('application/json')
    expect(init.headers.get('mcp-session-id')).toBeNull()
    expect(
      ((await init.json()) as { result: { serverInfo: { name: string } } }).result.serverInfo.name,
    ).toBe('arablyzer')

    const list = await call({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    expect(
      ((await list.json()) as { result: { tools: { name: string }[] } }).result.tools,
    ).toHaveLength(4)

    const run = await call({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'list_tools', arguments: { query: 'rtl' } },
    })
    const body = (await run.json()) as { result: { structuredContent: { count: number } } }
    expect(body.result.structuredContent.count).toBe(1)
  })

  it('has no stream to offer a GET', async () => {
    const response = await call(undefined, 'GET')
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('POST')
    expect((await call(undefined, 'DELETE')).status).toBe(405)
  })
})

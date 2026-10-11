import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import { ApiError, createMcpServer, type ApiClient } from '../src/index'
import { fakeClient, ID, report, scan } from './fixtures'

async function connect(
  client: ApiClient,
  extra: { sleep?: (ms: number) => Promise<void>; now?: () => number } = {},
) {
  const server = createMcpServer({ client, sleep: () => Promise.resolve(), ...extra })
  const [near, far] = InMemoryTransport.createLinkedPair()
  const mcp = new Client({ name: 'test', version: '1.0.0' })
  await Promise.all([server.connect(far), mcp.connect(near)])
  return mcp
}

const textOf = (result: unknown): string =>
  ((result as { content: { text: string }[] }).content[0] as { text: string }).text
const textOfContent = (read: { contents: object[] }): string =>
  (read.contents[0] as { text: string }).text
const dataOf = (result: unknown) =>
  (result as { structuredContent: Record<string, any> }).structuredContent

describe('the MCP server', () => {
  it('offers the four tools and says what Arablyzer is', async () => {
    const mcp = await connect(fakeClient())
    const { tools } = await mcp.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'get_report',
      'list_tools',
      'run_tool',
      'scan_page',
    ])
    for (const tool of tools) {
      expect(tool.description?.length ?? 0).toBeGreaterThan(40)
      expect(tool.inputSchema.type).toBe('object')
    }
    expect(mcp.getInstructions()).toMatch(/Arabic/)
  })

  it('scans a page, waits for it, and answers with the worst problems first', async () => {
    const client = fakeClient({
      getScan: (() => {
        let looks = 0
        return () =>
          Promise.resolve(++looks < 3 ? scan('running') : scan('complete', { score: 72 }))
      })(),
    })
    const mcp = await connect(client)
    const result = await mcp.callTool({
      name: 'scan_page',
      arguments: { url: 'https://example.com/', max_issues: 3 },
    })
    expect(result.isError).toBeFalsy()
    const data = dataOf(result)
    expect(data).toMatchObject({
      scanId: ID,
      state: 'complete',
      score: 72,
      reportPage: `https://arablyzer.example/r/${ID}`,
      reusedEarlierScan: false,
      renderedIn: ['chromium'],
      findings: { total: 7 },
      rules: { passed: 60, failed: 6, needsReview: 2, errored: 1 },
      moreIssues: 3,
    })
    expect(data.issues.map((issue: { ruleId: string }) => issue.ruleId)).toEqual([
      'rtl-direction',
      'img-alt',
      'lang',
    ])
    expect(data.issues[1]).toMatchObject({
      occurrences: 2,
      example: { selector: 'img.a' },
      message: { en: 'English img-alt', ar: 'عربي img-alt' },
    })
    expect(JSON.parse(textOf(result))).toEqual(data)
    expect(client.calls).toEqual(['startScan https://example.com/'])
  })

  it('says where an unfinished scan is, rather than failing, when the wait is over', async () => {
    let clock = 0
    const mcp = await connect(fakeClient({ getScan: () => Promise.resolve(scan('running')) }), {
      now: () => clock,
      sleep: (ms) => {
        clock += ms
        return Promise.resolve()
      },
    })
    const result = await mcp.callTool({
      name: 'scan_page',
      arguments: { url: 'https://example.com/', wait_seconds: 5 },
    })
    expect(result.isError).toBeFalsy()
    expect(dataOf(result)).toMatchObject({ scanId: ID, state: 'running' })
    expect(textOf(result)).toMatch(/get_report/)
    expect(clock).toBeLessThanOrEqual(5_000)
    const none = await mcp.callTool({
      name: 'scan_page',
      arguments: { url: 'https://example.com/', wait_seconds: 0 },
    })
    expect(dataOf(none)).toMatchObject({ state: 'queued' })
  })

  it('tells a failed scan and the API’s refusals as errors a model can act on', async () => {
    const failedScan = await connect(fakeClient({ getScan: () => Promise.resolve(scan('failed')) }))
    const failed = await failedScan.callTool({
      name: 'scan_page',
      arguments: { url: 'https://example.com/' },
    })
    expect(failed.isError).toBe(true)
    expect(textOf(failed)).toMatch(/scan_failed/)

    for (const [code, expected] of [
      ['rate_limited', /allowance/],
      ['plan_limit', /plan/],
      ['blocked_target', /blocked_target/],
    ] as const) {
      const refused = await connect(
        fakeClient({
          startScan: () => Promise.reject(new ApiError(code, 'No.', 400, { reason: 'x' })),
        }),
      )
      const result = await refused.callTool({
        name: 'scan_page',
        arguments: { url: 'http://localhost/' },
      })
      expect(result.isError).toBe(true)
      expect(textOf(result)).toMatch(expected)
      expect(dataOf(result).error).toMatchObject({ code, details: { reason: 'x' } })
    }
    const broken = await connect(
      fakeClient({ startScan: () => Promise.reject(new Error('secret stack')) }),
    )
    const unknown = await broken.callTool({
      name: 'scan_page',
      arguments: { url: 'https://example.com/' },
    })
    expect(textOf(unknown)).not.toMatch(/secret stack/)
  })

  it('checks its arguments before it calls the API', async () => {
    const client = fakeClient()
    const mcp = await connect(client)
    for (const args of [
      {},
      { url: '' },
      { url: 'https://example.com/', wait_seconds: 500 },
      { url: 'https://example.com/', engines: ['ie'] },
    ]) {
      const result = await mcp
        .callTool({ name: 'scan_page', arguments: args })
        .catch(() => ({ isError: true }))
      expect(result.isError, JSON.stringify(args)).toBe(true)
    }
    expect(client.calls).toEqual([])
  })

  it('gets the report of an earlier scan, and runs a tool', async () => {
    const client = fakeClient()
    const mcp = await connect(client)
    const got = await mcp.callTool({ name: 'get_report', arguments: { scan_id: ID } })
    expect(dataOf(got)).toMatchObject({ scanId: ID, score: 72 })
    const run = await mcp.callTool({
      name: 'run_tool',
      arguments: { tool: 'robots-check', url: 'https://example.com/' },
    })
    expect(dataOf(run)).toMatchObject({ tool: 'robots-check', state: 'complete' })
    expect(client.calls).toEqual(['runTool robots-check https://example.com/'])
    expect(report.findings.length).toBe(7)
  })

  it('lists the tools that run on a page, filtered by a word', async () => {
    const mcp = await connect(fakeClient())
    const all = dataOf(await mcp.callTool({ name: 'list_tools', arguments: {} }))
    expect(all.tools.map((tool: { slug: string }) => tool.slug)).toEqual([
      'robots-check',
      'rtl-check',
    ])
    const every = dataOf(
      await mcp.callTool({ name: 'list_tools', arguments: { runnable_only: false } }),
    )
    expect(every.count).toBe(3)
    const some = dataOf(await mcp.callTool({ name: 'list_tools', arguments: { query: 'RTL' } }))
    expect(some.tools.map((tool: { slug: string }) => tool.slug)).toEqual(['rtl-check'])
    const arabic = dataOf(
      await mcp.callTool({ name: 'list_tools', arguments: { query: 'أداة robots' } }),
    )
    expect(arabic.count).toBe(1)
  })
})

describe('the rule library as resources', () => {
  it('lists an index and every rule in both languages', async () => {
    const mcp = await connect(fakeClient())
    const { resources } = await mcp.listResources()
    expect(resources.map((resource) => resource.uri)).toEqual(
      expect.arrayContaining([
        'arablyzer://rules',
        'arablyzer://rules/en/img-alt',
        'arablyzer://rules/ar/img-alt',
        'arablyzer://rules/en/rtl-direction',
      ]),
    )
    const index = await mcp.readResource({ uri: 'arablyzer://rules' })
    expect(JSON.parse(textOfContent(index)).map((rule: { id: string }) => rule.id)).toEqual([
      'img-alt',
      'rtl-direction',
    ])
  })

  it('reads a rule in Arabic or English', async () => {
    const mcp = await connect(fakeClient())
    const en = await mcp.readResource({ uri: 'arablyzer://rules/en/img-alt' })
    expect(en.contents[0]).toMatchObject({ mimeType: 'text/markdown' })
    expect(textOfContent(en)).toMatch(/^# Rule img-alt/)
    expect(textOfContent(en)).toMatch(/## Why it matters\n\nBecause/)
    const ar = await mcp.readResource({ uri: 'arablyzer://rules/ar/img-alt' })
    expect(textOfContent(ar)).toMatch(/^# قاعدة img-alt/)
    expect(textOfContent(ar)).toMatch(/## لماذا يهم\n\nلأن/)
    await expect(mcp.readResource({ uri: 'arablyzer://rules/fr/img-alt' })).rejects.toThrow()
  })

  it('fails a rule the API does not have', async () => {
    const mcp = await connect(
      fakeClient({
        getRule: () => Promise.reject(new ApiError('not_found', 'There is nothing here.', 404)),
      }),
    )
    await expect(mcp.readResource({ uri: 'arablyzer://rules/en/nope' })).rejects.toThrow(
      /nothing here/,
    )
  })
})

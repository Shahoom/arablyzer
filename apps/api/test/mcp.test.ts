import { V1Error } from '@arablyzer/api-contract'
import { describe, expect, it } from 'vitest'
import { setup } from './support/keys-app'

const rpc = (id: number, method: string, params?: unknown) => ({
  jsonrpc: '2.0',
  id,
  method,
  ...(params === undefined ? {} : { params }),
})

function post(
  app: ReturnType<typeof setup>['app'],
  body: unknown,
  secret?: string,
  method = 'POST',
) {
  return app.request('/mcp', {
    method,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(secret === undefined ? {} : { authorization: `Bearer ${secret}` }),
    },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  })
}

interface Reply {
  result?: {
    tools?: { name: string }[]
    isError?: boolean
    structuredContent?: Record<string, unknown>
    content?: { text: string }[]
  }
  error?: { message: string }
}

describe('/mcp on the API', () => {
  it('wants a key, as the API does', async () => {
    const { app, withKey } = setup()
    const { secret } = await withKey('ali')
    for (const bad of [undefined, 'arb_short', `arb_${'z'.repeat(43)}`]) {
      const response = await post(app, rpc(1, 'tools/list'), bad)
      expect(response.status).toBe(401)
      expect(response.headers.get('www-authenticate')).toBe('Bearer')
      expect(V1Error.parse(await response.json()).error.code).toBe('unauthorized')
    }
    expect((await post(app, rpc(1, 'tools/list'), secret)).status).toBe(200)
    expect((await post(app, undefined, secret, 'GET')).status).toBe(405)
  })

  it('is off with accounts off', async () => {
    const { app } = setup({ accounts: false })
    const response = await post(app, rpc(1, 'tools/list'), `arb_${'a'.repeat(43)}`)
    expect(response.status).toBe(503)
    expect(V1Error.parse(await response.json()).error.code).toBe('accounts_off')
  })

  it('lists its tools and lists the tools of Arablyzer through the API', async () => {
    const { app, withKey } = setup()
    const { secret } = await withKey('ali')
    const tools = (await (await post(app, rpc(1, 'tools/list'), secret)).json()) as Reply
    expect(tools.result?.tools?.map((tool) => tool.name).sort()).toEqual([
      'get_report',
      'list_tools',
      'run_tool',
      'scan_page',
    ])
    const listed = (await (
      await post(
        app,
        rpc(2, 'tools/call', { name: 'list_tools', arguments: { query: 'robots' } }),
        secret,
      )
    ).json()) as Reply
    const slugs = (listed.result?.structuredContent?.tools as { slug: string }[]).map(
      (tool) => tool.slug,
    )
    expect(slugs).toContain('robots-check')
  })

  it('scans through the API: the account’s quota, its queue, its limits', async () => {
    const { app, withKey, queue, site } = setup({ plan: { ARABLYZER_PLAN_ACCOUNT_SCANS: '2' } })
    const { secret, cookie } = await withKey('ali')
    const scan = async (id: number, url: string) =>
      (await (
        await post(
          app,
          rpc(id, 'tools/call', { name: 'scan_page', arguments: { url, wait_seconds: 0 } }),
          secret,
        )
      ).json()) as Reply
    const first = await scan(1, 'https://example.com/a')
    expect(first.result?.isError).toBeFalsy()
    expect(first.result?.structuredContent).toMatchObject({
      state: 'queued',
      url: 'https://example.com/a',
    })
    expect(await queue.waiting()).toBe(1)
    // The same page again is the same scan, and costs nothing.
    const again = await scan(2, 'https://example.com/a')
    expect(again.result?.structuredContent).toMatchObject({
      scanId: first.result?.structuredContent?.scanId,
    })
    expect(await queue.waiting()).toBe(1)
    // The second page takes the account’s second scan; the third finds the bucket empty.
    expect((await scan(3, 'https://example.com/b')).result?.isError).toBeFalsy()
    const refused = await scan(4, 'https://example.com/c')
    expect(refused.result?.isError).toBe(true)
    expect(refused.result?.content?.[0]?.text).toMatch(/rate_limited/)
    // The same bucket the website draws on.
    const website = await site(
      'POST',
      '/api/scans',
      { url: 'https://example.com/d', turnstileToken: 't' },
      cookie,
    )
    expect(website.status).toBe(429)
  })

  it('refuses an address a scan never reaches, as a tool error', async () => {
    const { app, withKey } = setup()
    const { secret } = await withKey('ali')
    const reply = (await (
      await post(
        app,
        rpc(1, 'tools/call', { name: 'scan_page', arguments: { url: 'http://localhost/' } }),
        secret,
      )
    ).json()) as Reply
    expect(reply.result?.isError).toBe(true)
    expect(reply.result?.content?.[0]?.text).toMatch(/blocked_target/)
  })

  it('reads the rule library through the API', async () => {
    const { app, withKey } = setup()
    const { secret } = await withKey('ali')
    const read = (await (
      await post(app, rpc(1, 'resources/read', { uri: 'arablyzer://rules' }), secret)
    ).json()) as { result: { contents: { text: string }[] } }
    const rules = JSON.parse(read.result.contents[0]?.text ?? '[]') as { id: string }[]
    expect(rules.length).toBeGreaterThan(50)
    const one = (await (
      await post(
        app,
        rpc(2, 'resources/read', { uri: `arablyzer://rules/ar/${rules[0]?.id ?? ''}` }),
        secret,
      )
    ).json()) as { result: { contents: { text: string }[] } }
    expect(one.result.contents[0]?.text).toMatch(/^# /)
  })
})

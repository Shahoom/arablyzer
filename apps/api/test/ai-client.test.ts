import Anthropic from '@anthropic-ai/sdk'
import { DEFAULT_POLICY, type safeFetch } from '@arablyzer/egress'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAssistant, requestFor } from '../src/ai/assistant'
import { anthropicClient, API_ORIGIN, egressFetch } from '../src/ai/client'
import { aiSettingsFrom, type AiSettings } from '../src/ai/settings'
import { MemoryAiData } from '@arablyzer/store'
import { answerJson, messageOf, must, ruleReport } from './support/ai'

type Fetcher = typeof safeFetch
type Options = Parameters<Fetcher>[1]

const SETTINGS: AiSettings = must(
  aiSettingsFrom({ ANTHROPIC_API_KEY: 'sk-ant-secret-key', ARABLYZER_AI_SPEND_MONTHLY: '50' }),
)

/** An egress fetch that answers from `reply` and keeps what it was asked. */
function fakeEgress(reply: (url: string) => { status: number; body: unknown } | null) {
  const calls: { url: string; options: Options }[] = []
  const fetcher: Fetcher = (url, options) => {
    calls.push({ url, options })
    const answer = reply(url)
    return Promise.resolve({
      requestedUrl: url,
      redirects: [],
      response:
        answer === null
          ? null
          : {
              url,
              status: answer.status,
              headers: [
                ['content-type', 'application/json'],
                ['content-encoding', 'gzip'],
                ['content-length', '999'],
              ],
              body: new TextEncoder().encode(JSON.stringify(answer.body)),
              truncated: false,
              remoteAddress: null,
              certificate: null,
            },
      error: null,
      startedAt: '2026-10-09T12:00:00.000Z',
      durationMs: 5,
      privateAccess: false,
    } as unknown as Awaited<ReturnType<Fetcher>>)
  }
  return { fetcher, calls }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('the model’s client on the egress fetch', () => {
  it('sends the SDK’s request through the egress fetch, key and all, and reads the answer', async () => {
    const egress = fakeEgress(() => ({ status: 200, body: messageOf({ text: answerJson('en') }) }))
    const client = anthropicClient(SETTINGS, { policy: DEFAULT_POLICY, fetcher: egress.fetcher })
    const params = requestFor(SETTINGS, 'user text')
    const message = await client.messages.create(params)
    expect(message.stop_reason).toBe('end_turn')
    expect(message.usage.input_tokens).toBe(1000)
    const [call] = egress.calls
    expect(egress.calls).toHaveLength(1)
    expect(call?.url).toBe(`${API_ORIGIN}/v1/messages`)
    expect(call?.options.json).toEqual(params)
    expect(call?.options.headers?.authorization).toBe('Bearer sk-ant-secret-key')
    expect(call?.options.headers?.['anthropic-version']).toBeDefined()
    // The headers the egress fetch sets itself are not passed on to it.
    expect(Object.keys(call?.options.headers ?? {})).not.toContain('content-type')
    expect(Object.keys(call?.options.headers ?? {})).not.toContain('user-agent')
    expect(call?.options.maxRedirects).toBe(0)
    expect(call?.options.policy).toBe(DEFAULT_POLICY)
  })

  it('goes to the Claude API whatever the environment says, with the key it was given', async () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'https://evil.example')
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-from-env')
    const egress = fakeEgress(() => ({ status: 200, body: messageOf({ text: answerJson('en') }) }))
    const client = anthropicClient(SETTINGS, { policy: DEFAULT_POLICY, fetcher: egress.fetcher })
    await client.messages.create(requestFor(SETTINGS, 'x'))
    expect(egress.calls[0]?.url).toBe(`${API_ORIGIN}/v1/messages`)
    expect(egress.calls[0]?.options.headers?.authorization).toBe('Bearer sk-ant-secret-key')
  })

  it('refuses anything but a JSON POST', async () => {
    const egress = fakeEgress(() => null)
    const fetch = egressFetch({ policy: DEFAULT_POLICY, timeoutMs: 1000, fetcher: egress.fetcher })
    await expect(fetch(`${API_ORIGIN}/v1/models`)).rejects.toThrow(TypeError)
    await expect(fetch(`${API_ORIGIN}/v1/messages`, { method: 'POST' })).rejects.toThrow(TypeError)
    expect(egress.calls).toHaveLength(0)
  })

  it('becomes a connection error for the SDK when nothing came back', async () => {
    const egress = fakeEgress(() => null)
    const client = new Anthropic({
      apiKey: 'k',
      baseURL: API_ORIGIN,
      maxRetries: 0,
      fetch: egressFetch({ policy: DEFAULT_POLICY, timeoutMs: 1000, fetcher: egress.fetcher }),
    })
    await expect(client.messages.create(requestFor(SETTINGS, 'x'))).rejects.toBeInstanceOf(
      Anthropic.APIConnectionError,
    )
  })
})

describe('the real egress fetch', () => {
  it('takes the SDK’s headers and body, and refuses an address the policy closes before any request', async () => {
    // A literal private address: the egress fetch answers at once, with no DNS and no connection.
    const client = new Anthropic({
      apiKey: 'sk-ant-secret-key',
      baseURL: 'https://127.0.0.1',
      maxRetries: 0,
      fetch: egressFetch({ policy: DEFAULT_POLICY, timeoutMs: 5000 }),
    })
    const failure = await client.messages.create(requestFor(SETTINGS, 'x')).catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(Anthropic.APIConnectionError)
    // Not a header or a body the egress fetch found fault with: it never got as far as a connection.
    expect(((failure as Error).cause as Error).message).toBe(
      'The request to the model did not complete',
    )
  })
})

describe('what the assistant tells of the model’s failures', () => {
  const failing = async (status: number, body: unknown) => {
    const egress = fakeEgress(() => ({ status, body }))
    const client = new Anthropic({
      apiKey: 'sk-ant-secret-key',
      baseURL: API_ORIGIN,
      maxRetries: 0,
      fetch: egressFetch({ policy: DEFAULT_POLICY, timeoutMs: 1000, fetcher: egress.fetcher }),
    })
    const data = new MemoryAiData()
    const logs: string[] = []
    const assistant = createAssistant({
      settings: SETTINGS,
      data,
      client,
      newId: () => 'req'.padEnd(22, '_'),
      now: () => new Date('2026-10-09T12:00:00.000Z'),
      log: (line) => logs.push(line),
    })
    const result = await assistant.suggest({
      userId: 'ali'.padEnd(22, '_'),
      perDay: 5,
      report: ruleReport('img-alt', [{ snippet: '<img>' }]),
      ruleId: 'img-alt',
      language: 'en',
    })
    return { result, logs, data }
  }

  it.each([
    [429, 'rate_limit_error'],
    [529, 'overloaded_error'],
    [500, 'api_error'],
    [401, 'authentication_error'],
    [400, 'invalid_request_error'],
  ])(
    'answers unavailable for %i, bills nothing, and tells neither the key nor the body',
    async (status, type) => {
      const secret = 'the-upstream-said-sk-ant-secret-key-and-this'
      const { result, logs, data } = await failing(status, {
        type: 'error',
        error: { type, message: secret },
      })
      expect(result).toEqual({ ok: false, error: 'unavailable' })
      expect((await data.spent(new Date('2026-10-09T12:00:00.000Z'))).day).toBe(0)
      const told = logs.join('\n')
      expect(told).not.toContain('sk-ant')
      expect(told).not.toContain('the-upstream')
      expect(told).toContain(String(status))
    },
  )
})

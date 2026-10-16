import type { NlpTextJob, NlpTextResult } from '@arablyzer/api-contract/codes'
import { DEFAULT_POLICY } from '@arablyzer/egress'
import { DEVELOPMENT_LIMITS } from '@arablyzer/plans'
import {
  MemoryHandoff,
  MemoryInFlight,
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  MemoryScanStore,
  type NlpChecks,
} from '@arablyzer/store'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { apiDeps } from '../src/config'
import { paragraphsOf } from '../src/nlp/routes'

const NOW = new Date('2026-10-16T12:00:00Z')
const SITE = 'https://arablyzer.example'

const ANSWER: Extract<NlpTextResult, { ok: true }> = {
  ok: true,
  answer: {
    kind: 'spelling',
    findings: [
      {
        word: 'الاسعار',
        suggestion: 'الأسعار',
        family: 'hamza',
        confidence: 97,
        before: 'تتميز',
        after: 'في متجرنا',
        alternatives: [],
      },
    ],
    words: 5,
    judged: 5,
    truncated: false,
    minConfidence: 90,
  },
}

function setup(
  options: { env?: Record<string, string>; result?: NlpTextResult; turnstile?: boolean } = {},
) {
  const jobs: NlpTextJob[] = []
  const checks: NlpChecks = {
    check: (job) => {
      jobs.push(job)
      return Promise.resolve(options.result ?? ANSWER)
    },
    close: () => Promise.resolve(),
  }
  const deps = {
    ...apiDeps(
      { ARABLYZER_SITE: SITE, ARABLYZER_LIMIT_SECRET: 'x'.repeat(40), ...options.env },
      {
        store: new MemoryScanStore(),
        queue: new MemoryScanQueue(),
        events: new MemoryScanEvents(20),
        limiter: new MemoryRateLimiter(),
        inFlight: new MemoryInFlight(),
        handoff: new MemoryHandoff(() => NOW.getTime()),
        nlpChecks: checks,
      },
      () => undefined,
    ),
    limits: DEVELOPMENT_LIMITS,
    policy: DEFAULT_POLICY,
    address: () => '203.0.113.9',
    now: () => NOW,
    ...(options.turnstile === false ? { turnstile: () => Promise.resolve(false) } : {}),
  }
  const app = createApp(deps)
  const post = (body: unknown) =>
    app.request('/api/nlp/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: SITE },
      body: JSON.stringify(body),
    })
  return { app, post, jobs }
}

const ON = { ARABLYZER_NLP_TEXT: '1' }
const TEXT = 'تتميز الاسعار في متجرنا بالمنافسة طوال العام.\n\nنوصل الطلبات إلى جميع المدن.'

describe('the Arabic text tools', () => {
  it('are off by default: the status says so and the route does not exist', async () => {
    const { app, post } = setup()
    expect(await (await app.request('/api/nlp/status')).json()).toEqual({ text: false })
    expect((await post({ kind: 'spelling', text: TEXT, turnstileToken: 't' })).status).toBe(404)
  })

  it('check a pasted text through the worker, line by line, and answer with its answer', async () => {
    const { app, post, jobs } = setup({ env: ON })
    expect(await (await app.request('/api/nlp/status')).json()).toEqual({ text: true })
    const response = await post({ kind: 'spelling', text: TEXT, turnstileToken: 't' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(ANSWER.answer)
    expect(jobs).toEqual([
      {
        kind: 'spelling',
        texts: ['تتميز الاسعار في متجرنا بالمنافسة طوال العام.', 'نوصل الطلبات إلى جميع المدن.'],
        sensitivity: 'sure',
      },
    ])
  })

  it('pass the wider net on, and refuse a word it does not know', async () => {
    const { post, jobs } = setup({ env: ON })
    await post({ kind: 'dialect', text: TEXT, sensitivity: 'wide', turnstileToken: 't' })
    expect(jobs[0]).toMatchObject({ kind: 'dialect', sensitivity: 'wide' })
    expect(
      (await post({ kind: 'dialect', text: TEXT, sensitivity: 'loud', turnstileToken: 't' }))
        .status,
    ).toBe(400)
    expect((await post({ kind: 'translate', text: TEXT, turnstileToken: 't' })).status).toBe(400)
  })

  it('refuse a text that is empty, too long, without Arabic letters, or not text', async () => {
    const { post, jobs } = setup({ env: ON })
    for (const text of ['', '   \n  ', 'x'.repeat(10), 'ا'.repeat(4001), 42, null]) {
      expect(
        (await post({ kind: 'spelling', text, turnstileToken: 't' })).status,
        String(text).slice(0, 8),
      ).toBe(400)
    }
    expect(
      (await post({ kind: 'spelling', text: 'نص\n'.repeat(61), turnstileToken: 't' })).status,
    ).toBe(400)
    expect(jobs).toEqual([])
  })

  it('take a scan of the visitor’s quota, with its Turnstile, before anything is sent', async () => {
    const refused = setup({ env: ON, turnstile: false })
    expect(
      (await refused.post({ kind: 'spelling', text: TEXT, turnstileToken: 'bad' })).status,
    ).toBe(403)
    expect(refused.jobs).toEqual([])
  })

  it('say the service is away when the worker gives no answer, and never keep the text', async () => {
    const { post } = setup({ env: ON, result: { ok: false } })
    const response = await post({ kind: 'spelling', text: TEXT, turnstileToken: 't' })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
  })

  it('split a text into its lines', () => {
    expect(paragraphsOf(' أ  ب \r\n\r\n ج ')).toEqual(['أ ب', 'ج'])
    expect(paragraphsOf('\n \n')).toBeNull()
  })
})

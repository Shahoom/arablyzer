import type { SerpResponse, SuggestResponse } from '@arablyzer/api-contract'
import { DEFAULT_POLICY, type safeFetch, type SafeFetchOptions } from '@arablyzer/egress'
import { DEVELOPMENT_LIMITS } from '@arablyzer/plans'
import {
  MemoryHandoff,
  MemoryInFlight,
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  MemoryScanStore,
} from '@arablyzer/store'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { apiDeps } from '../src/config'
import { DayCache } from '../src/search/cache'
import {
  arabicSite,
  arabicTitle,
  cleanDomain,
  domainOf,
  isCheckPage,
  organicResults,
  rivalsOf,
} from '../src/search/serp'
import { cleanTerm, expansions, LETTERS, QUESTIONS } from '../src/search/suggest'

const NOW = new Date('2026-10-11T12:00:00Z')
const SITE = 'https://arablyzer.example'

describe('the cache', () => {
  it('keeps an entry for a day, forgets it after, and drops the oldest past its size', () => {
    let at = 1_000
    const cache = new DayCache<string>(() => at, 2)
    cache.set('a', '1')
    cache.set('b', '2')
    cache.set('c', '3')
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('c')).toBe('3')
    at += 24 * 60 * 60 * 1000 - 1
    expect(cache.get('b')).toBe('2')
    at += 1
    expect(cache.get('b')).toBeUndefined()
    expect(cache.size).toBe(1)
  })
})

describe('the suggestion tree’s questions', () => {
  it('asks the seed, four question words before it, and the 28 letters after it', () => {
    const plan = expansions('قهوة')
    expect(plan).toHaveLength(1 + QUESTIONS.length + LETTERS.length)
    expect(LETTERS).toHaveLength(28)
    expect(plan[0]).toEqual({ kind: 'seed', trigger: '', query: 'قهوة' })
    expect(plan[1]).toEqual({ kind: 'question', trigger: 'كيف', query: 'كيف قهوة' })
    expect(plan.at(-1)).toEqual({ kind: 'letter', trigger: 'ي', query: 'قهوة ي' })
    expect(new Set(plan.map((step) => step.query)).size).toBe(plan.length)
  })

  it('takes a seed of one to four words, and nothing else', () => {
    expect(cleanTerm('  قهوة   عربية ')).toBe('قهوة عربية')
    expect(cleanTerm('a')).toBeNull()
    expect(cleanTerm('one two three four five')).toBeNull()
    expect(cleanTerm('x'.repeat(61))).toBeNull()
    expect(cleanTerm('line\nbreak')).toBeNull()
    expect(cleanTerm('<script>')).toBeNull()
    expect(cleanTerm('--')).toBeNull()
    expect(cleanTerm(42)).toBeNull()
  })
})

const GOOGLE_LITE = `<html><body>
<div><a href="/url?q=https://www.alwaha.com.sa/shop&amp;sa=U&amp;ved=1"><h3>متجر الواحة للقهوة</h3><div>alwaha.com.sa</div></a></div>
<div><a href="/url?q=https%3A%2F%2Fcoffee.example.com%2Fbuy&amp;sa=U"><div>Buy coffee online</div></a></div>
<div><a href="/url?q=https://www.alwaha.com.sa/other&amp;sa=U"><h3>صفحة أخرى</h3></a></div>
<div><a href="/url?q=https://www.youtube.com/watch?v=1&amp;sa=U"><h3>video</h3></a></div>
<div><a href="/search?q=related">related</a></div>
<div><a href="/url?q=javascript:alert(1)&amp;sa=U">x</a></div>
</body></html>`

const GOOGLE_FULL = `<html><body>
<a href="https://support.google.com/websearch"><h3>Help</h3></a>
<a href="https://www.ikea.com/sa/ar/"><h3>ايكيا السعودية</h3></a>
<a href="https://noheading.example.org/page">no heading, so not a result</a>
<a href="https://jarir.com/"><h3>Jarir &amp; Co</h3></a>
</body></html>`

describe('reading a results page', () => {
  it('reads the lightweight page: domains of /url?q= links, each once, Google’s own left out', () => {
    expect(organicResults(GOOGLE_LITE)).toEqual([
      { domain: 'alwaha.com.sa', title: 'متجر الواحة للقهوة' },
      { domain: 'coffee.example.com', title: 'Buy coffee online' },
    ])
  })

  it('reads the full page: direct links that hold a heading', () => {
    expect(organicResults(GOOGLE_FULL)).toEqual([
      { domain: 'ikea.com', title: 'ايكيا السعودية' },
      { domain: 'jarir.com', title: 'Jarir & Co' },
    ])
    expect(organicResults('<html>nothing</html>')).toEqual([])
  })

  it('stops at ten', () => {
    const links = Array.from(
      { length: 14 },
      (_, i) => `<a href="/url?q=https://site${i}.example.com/"><h3>t</h3></a>`,
    ).join('')
    expect(organicResults(links)).toHaveLength(10)
  })

  it('knows the pages Google sends instead of results', () => {
    expect(isCheckPage('https://www.google.com/sorry/index?continue=x', '')).toBe(true)
    expect(isCheckPage('https://consent.google.com/m?continue=x', '')).toBe(true)
    expect(isCheckPage('https://www.google.com/search?q=x', '<form id="captcha-form">')).toBe(true)
    expect(
      isCheckPage('https://www.google.com/search?q=x', 'Our systems detected unusual traffic'),
    ).toBe(true)
    expect(isCheckPage('https://www.google.com/search?q=x', GOOGLE_LITE)).toBe(false)
  })

  it('says an Arabic site by its title or its country suffix, and not by anything else', () => {
    expect(arabicTitle('متجر الواحة للقهوة')).toBe(true)
    expect(arabicTitle('Al Waha متجر')).toBe(false)
    expect(arabicTitle('')).toBe(false)
    expect(arabicSite('alwaha.com.sa', 'Al Waha coffee')).toEqual(['tld'])
    expect(arabicSite('alwaha.com', 'متجر الواحة')).toEqual(['title'])
    expect(arabicSite('alwaha.sa', 'متجر الواحة')).toEqual(['title', 'tld'])
    expect(arabicSite('ikea.com', 'IKEA')).toEqual([])
    expect(arabicSite('xn--mgbaakc7dvf.xn--mgberp4a5d4ar', 'x')).toEqual(['tld'])
  })

  it('folds a domain the visitor typed, however it came', () => {
    expect(cleanDomain('https://www.Example.com/ar/')).toBe('example.com')
    expect(cleanDomain('shop.example.com')).toBe('shop.example.com')
    for (const bad of ['', 'localhost', 'a b.com', 'user@example.com', 'example.com:8080', 7]) {
      expect(cleanDomain(bad), String(bad)).toBeNull()
    }
    expect(domainOf('ftp://example.com')).toBeNull()
  })

  it('names the domains that recur across queries, the visitor’s own left out', () => {
    const result = (position: number, domain: string, arabic = false) => ({
      position,
      domain,
      arabic,
      signals: arabic ? (['tld'] as const) : [],
    })
    const queries = [
      {
        query: 'a',
        outcome: 'ok' as const,
        results: [result(1, 'x.com'), result(2, 'me.com'), result(3, 'y.sa', true)],
        you: 2,
      },
      {
        query: 'b',
        outcome: 'ok' as const,
        results: [result(4, 'x.com'), result(1, 'y.sa', true), result(5, 'me.com')],
        you: 5,
      },
      { query: 'c', outcome: 'blocked' as const, results: [], you: null },
    ]
    expect(rivalsOf(queries, 'me.com')).toEqual([
      { domain: 'x.com', queries: 2, best: 1, arabic: false },
      { domain: 'y.sa', queries: 2, best: 1, arabic: true },
    ])
    expect(rivalsOf(queries, null).map((rival) => rival.domain)).toContain('me.com')
  })
})

// The routes, with Google's two pages answered by a fake fetch that notes what it was asked.
interface Call {
  readonly url: string
  readonly options: SafeFetchOptions
}

function setup(
  options: {
    env?: Record<string, string>
    suggest?: (query: string) => string[] | 'html' | 'status'
    serp?: (query: string) => { status?: number; url?: string; body: string }
    turnstile?: boolean
  } = {},
) {
  const calls: Call[] = []
  const answer = (status: number, body: string, url = '') => ({
    response: {
      url,
      status,
      headers: [],
      body: new TextEncoder().encode(body),
      truncated: false,
      remoteAddress: null,
      certificate: null,
    },
  })
  const fetcher = ((url: string, fetchOptions: SafeFetchOptions) => {
    calls.push({ url, options: fetchOptions })
    const parsed = new URL(url)
    const q = parsed.searchParams.get('q') ?? ''
    if (parsed.hostname === 'suggestqueries.google.com') {
      const made = options.suggest?.(q) ?? [`${q} واحد`, `${q} اثنان`]
      if (made === 'html') return Promise.resolve(answer(200, '<html>consent</html>'))
      if (made === 'status') return Promise.resolve(answer(429, ''))
      return Promise.resolve(answer(200, JSON.stringify([q, made, [], {}])))
    }
    if (parsed.hostname === 'www.google.com') {
      const made = options.serp?.(q) ?? { body: GOOGLE_LITE }
      return Promise.resolve(answer(made.status ?? 200, made.body, made.url ?? url))
    }
    return Promise.resolve(answer(404, ''))
  }) as unknown as typeof safeFetch
  const sleeps: number[] = []
  const deps = {
    ...apiDeps(
      {
        ARABLYZER_SITE: SITE,
        ARABLYZER_LIMIT_SECRET: 'x'.repeat(40),
        ...options.env,
      },
      {
        store: new MemoryScanStore(),
        queue: new MemoryScanQueue(),
        events: new MemoryScanEvents(20),
        limiter: new MemoryRateLimiter(),
        inFlight: new MemoryInFlight(),
        handoff: new MemoryHandoff(() => NOW.getTime()),
      },
      () => undefined,
      {
        fetcher,
        searchSleep: (ms) => {
          sleeps.push(ms)
          return Promise.resolve()
        },
      },
    ),
    limits: DEVELOPMENT_LIMITS,
    policy: DEFAULT_POLICY,
    address: () => '203.0.113.9',
    now: () => NOW,
    ...(options.turnstile === false ? { turnstile: () => Promise.resolve(false) } : {}),
  }
  const app = createApp(deps)
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: SITE, ...headers },
      body: JSON.stringify(body),
    })
  return { app, calls, post, sleeps }
}

const ON = { ARABLYZER_SUGGEST: '1', ARABLYZER_SERP: '1' }

describe('the flags', () => {
  it('are off by default: the status says so and neither route exists', async () => {
    const { app, post } = setup()
    expect(await (await app.request('/api/search/status')).json()).toEqual({
      suggest: false,
      serp: false,
    })
    expect((await post('/api/search/suggest', { seed: 'قهوة', turnstileToken: '' })).status).toBe(
      404,
    )
    expect((await post('/api/search/serp', { queries: ['قهوة'], turnstileToken: '' })).status).toBe(
      404,
    )
  })

  it('are separate: the suggestion tree on does not turn the sampler on', async () => {
    const { app, post, calls } = setup({ env: { ARABLYZER_SUGGEST: '1' } })
    expect(await (await app.request('/api/search/status')).json()).toEqual({
      suggest: true,
      serp: false,
    })
    expect((await post('/api/search/serp', { queries: ['قهوة'], turnstileToken: '' })).status).toBe(
      404,
    )
    expect(calls).toEqual([])
  })

  it('count only the word 1', async () => {
    const { app } = setup({ env: { ARABLYZER_SUGGEST: 'true', ARABLYZER_SERP: 'yes' } })
    expect(await (await app.request('/api/search/status')).json()).toEqual({
      suggest: false,
      serp: false,
    })
  })
})

describe('POST /api/search/suggest', () => {
  it('asks the 33 questions one at a time, as ArablyzerBot, and groups and deduplicates the answers', async () => {
    const { post, calls, sleeps } = setup({
      env: ON,
      suggest: (query) => [query, `${query} مشترك`, 'عام مشترك'],
    })
    const response = await post('/api/search/suggest', { seed: 'قهوة', turnstileToken: 't' })
    expect(response.status).toBe(200)
    const tree = (await response.json()) as SuggestResponse
    expect(calls).toHaveLength(33)
    expect(sleeps).toHaveLength(32)
    expect(sleeps.every((ms) => ms === 500)).toBe(true)
    const first = calls[0]
    expect(first?.options.userAgent).toMatch(/^ArablyzerBot\//)
    expect(first?.options.policy).toBe(DEFAULT_POLICY)
    const url = new URL(first?.url ?? '')
    expect(url.origin + url.pathname).toBe('https://suggestqueries.google.com/complete/search')
    expect(Object.fromEntries(url.searchParams)).toEqual({ client: 'firefox', hl: 'ar', q: 'قهوة' })
    expect(tree).toMatchObject({ seed: 'قهوة', answered: 33, asked: 33, stopped: null })
    expect(tree.groups.map((g) => g.kind)).toEqual([
      'seed',
      ...Array.from({ length: 4 }, () => 'question'),
      ...Array.from({ length: 28 }, () => 'letter'),
    ])
    // «عام مشترك» is given by every question: it is in the first group only.
    expect(tree.groups[0]?.suggestions).toEqual(['قهوة', 'قهوة مشترك', 'عام مشترك'])
    expect(tree.groups[1]?.suggestions).toEqual(['كيف قهوة', 'كيف قهوة مشترك'])
    const all = tree.groups.flatMap((g) => g.suggestions)
    expect(new Set(all).size).toBe(all.length)
    expect(tree.total).toBe(all.length)
  })

  it('answers the same seed again from its cache, asking Google nothing', async () => {
    const { post, calls } = setup({ env: ON })
    await post('/api/search/suggest', { seed: 'قهوة', turnstileToken: 't' })
    const before = calls.length
    const again = await post('/api/search/suggest', { seed: 'قهوة', turnstileToken: 't' })
    expect(again.status).toBe(200)
    expect(calls.length).toBe(before)
  })

  it('stops at the first answer it cannot read, and keeps what came before', async () => {
    const { post, calls } = setup({
      env: ON,
      suggest: (query) => (query.startsWith('كيف') ? 'html' : [`${query} ١`]),
    })
    const tree = (await (
      await post('/api/search/suggest', { seed: 'قهوة', turnstileToken: 't' })
    ).json()) as SuggestResponse
    expect(tree).toMatchObject({ answered: 1, asked: 2, stopped: 'unreadable' })
    expect(tree.groups).toHaveLength(1)
    expect(calls).toHaveLength(2)
  })

  it('refuses a seed that is not one, a foreign origin, a failed Turnstile, and a request past the limit', async () => {
    const { post, calls } = setup({ env: ON })
    for (const seed of ['', 'a', 'one two three four five', 'x'.repeat(80), 7]) {
      expect((await post('/api/search/suggest', { seed, turnstileToken: 't' })).status).toBe(400)
    }
    expect(
      (
        await post(
          '/api/search/suggest',
          { seed: 'قهوة', turnstileToken: 't' },
          { origin: 'https://evil.example' },
        )
      ).status,
    ).toBe(400)
    expect(calls).toEqual([])

    const failed = setup({ env: ON, turnstile: false })
    expect(
      (await failed.post('/api/search/suggest', { seed: 'قهوة', turnstileToken: 'bad' })).status,
    ).toBe(403)
    expect(failed.calls).toEqual([])

    const limited = setup({ env: ON })
    let status = 200
    for (let i = 0; i < DEVELOPMENT_LIMITS.perConnection.scans + 1 && status === 200; i++) {
      status = (
        await limited.post('/api/search/suggest', { seed: `كلمة ${i}`, turnstileToken: 't' })
      ).status
    }
    expect(status).toBe(429)
  })
})

describe('POST /api/search/serp', () => {
  it('reads the organic domains, marks the Arabic sites and finds the visitor’s domain', async () => {
    const { post, calls } = setup({ env: ON })
    const response = await post('/api/search/serp', {
      queries: ['قهوة', 'قهوة سعودية'],
      domain: 'https://www.coffee.example.com/',
      turnstileToken: 't',
    })
    expect(response.status).toBe(200)
    const result = (await response.json()) as SerpResponse
    expect(result.domain).toBe('coffee.example.com')
    expect(result.queries).toHaveLength(2)
    expect(result.queries[0]).toEqual({
      query: 'قهوة',
      outcome: 'ok',
      you: 2,
      results: [
        { position: 1, domain: 'alwaha.com.sa', arabic: true, signals: ['title', 'tld'] },
        { position: 2, domain: 'coffee.example.com', arabic: false, signals: [] },
      ],
    })
    // The same page twice: the second query is a different one, so two fetches; the domain recurs.
    expect(calls).toHaveLength(2)
    expect(result.rivals).toEqual([{ domain: 'alwaha.com.sa', queries: 2, best: 1, arabic: true }])
    const url = new URL(calls[0]?.url ?? '')
    expect(url.origin + url.pathname).toBe('https://www.google.com/search')
    expect(url.searchParams.get('num')).toBe('10')
    expect(calls[0]?.options.userAgent).toMatch(/^ArablyzerBot\//)
    // Only domains: no address, title or snippet of a result is in the answer.
    expect(JSON.stringify(result)).not.toContain('/shop')
    expect(JSON.stringify(result)).not.toContain('متجر الواحة')
  })

  it('keeps a list a day, so a repeat asks Google nothing', async () => {
    const { post, calls } = setup({ env: ON })
    await post('/api/search/serp', { queries: ['قهوة'], turnstileToken: 't' })
    await post('/api/search/serp', { queries: ['قهوة'], turnstileToken: 't' })
    expect(calls).toHaveLength(1)
  })

  it('stops asking at the first check Google asks for, and keeps nothing of it', async () => {
    const { post, calls } = setup({
      env: ON,
      serp: (q) =>
        q === 'ثاني'
          ? { url: 'https://www.google.com/sorry/index', body: 'unusual traffic' }
          : { body: GOOGLE_LITE },
    })
    const result = (await (
      await post('/api/search/serp', { queries: ['أول', 'ثاني', 'ثالث'], turnstileToken: 't' })
    ).json()) as SerpResponse
    expect(result.queries.map((q) => q.outcome)).toEqual(['ok', 'blocked', 'blocked'])
    expect(calls).toHaveLength(2)
    // The blocked query is not cached: asked again, Google is asked again.
    await post('/api/search/serp', { queries: ['ثاني'], turnstileToken: 't' })
    expect(calls).toHaveLength(3)
  })

  it('says a page it cannot read, a status it does not know, and a fetch that failed', async () => {
    const { post } = setup({
      env: ON,
      serp: (q) =>
        q === 'a1'
          ? { body: '<html>no results here</html>' }
          : q === 'b2'
            ? { status: 500, body: '' }
            : { status: 429, body: '' },
    })
    const result = (await (
      await post('/api/search/serp', { queries: ['a1', 'b2', 'c3'], turnstileToken: 't' })
    ).json()) as SerpResponse
    expect(result.queries.map((q) => q.outcome)).toEqual(['unreadable', 'failed', 'blocked'])
  })

  it('takes one to five queries and a domain, and nothing else', async () => {
    const { post, calls } = setup({ env: ON })
    const six = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6']
    expect((await post('/api/search/serp', { queries: six, turnstileToken: 't' })).status).toBe(400)
    expect((await post('/api/search/serp', { queries: [], turnstileToken: 't' })).status).toBe(400)
    expect((await post('/api/search/serp', { turnstileToken: 't' })).status).toBe(400)
    expect(
      (await post('/api/search/serp', { queries: ['a1', 5], turnstileToken: 't' })).status,
    ).toBe(400)
    expect(
      (
        await post('/api/search/serp', {
          queries: ['a1'],
          domain: 'not a domain',
          turnstileToken: 't',
        })
      ).status,
    ).toBe(400)
    expect(calls).toEqual([])
    const five = await post('/api/search/serp', { queries: six.slice(0, 5), turnstileToken: 't' })
    expect(five.status).toBe(200)
    expect(calls).toHaveLength(5)
  })
})

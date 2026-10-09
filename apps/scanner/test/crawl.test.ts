import type { Crawler, PageResult, SeedsResult } from '@arablyzer/engine'
import { remoteCrawler, ScannerUnavailable } from '@arablyzer/scanner-client'
import { describe, expect, it } from 'vitest'
import { createScannerApp, MAX_CRAWL_READS } from '../src/app'

// M4.5: the scanner reads pages for a crawl on POST /crawl, and the crawler's client checks every
// answer against the protocol.

const TOKEN = 'a-token-long-enough-to-be-the-workers-own'
const OK: PageResult = {
  outcome: 'ok',
  status: 200,
  finalUrl: 'https://shop.example/',
  error: null,
  title: 'Shop',
  links: ['https://shop.example/a'],
  skeleton: 'main',
  issues: [
    {
      id: 'title-missing',
      severity: 'serious',
      count: 1,
      title: { ar: 'العنوان مفقود', en: 'Title missing' },
    },
  ],
  score: 80,
  crawlDelayMs: null,
}
const SEEDS: SeedsResult = {
  robots: 'fetched',
  crawlDelayMs: 1000,
  sitemaps: 1,
  urls: ['https://shop.example/a'],
  more: false,
}
const crawler = (overrides: Partial<Crawler> = {}): Crawler => ({
  page: () => Promise.resolve(OK),
  seeds: () => Promise.resolve(SEEDS),
  ...overrides,
})
const pair = (c: Crawler | undefined, token = TOKEN) => {
  const app = createScannerApp({
    token: TOKEN,
    scanner: () => Promise.reject(new Error('no scan here')),
    ...(c === undefined ? {} : { crawler: c }),
  })
  return {
    app,
    client: remoteCrawler('http://scanner:8788', token, (input, init) =>
      Promise.resolve(app.request(input, init)),
    ),
  }
}

describe('POST /crawl', () => {
  it('answers a page and a site’s seeds, checked by the client', async () => {
    const { client } = pair(crawler())
    expect(await client.page('https://shop.example/')).toEqual(OK)
    expect(await client.seeds('https://shop.example')).toEqual(SEEDS)
  })

  it('passes anyOrigin to the crawler, for the start page alone', async () => {
    const seen: unknown[] = []
    const { client } = pair(
      crawler({
        page: (url, options) => {
          seen.push([url, options?.anyOrigin ?? false])
          return Promise.resolve(OK)
        },
      }),
    )
    await client.page('https://shop.example/', { anyOrigin: true })
    await client.page('https://shop.example/a')
    expect(seen).toEqual([
      ['https://shop.example/', true],
      ['https://shop.example/a', false],
    ])
  })

  it('answers no one without the token, and nothing when it has no crawler', async () => {
    const { app } = pair(crawler())
    const body = JSON.stringify({ op: 'seeds', url: 'https://shop.example' })
    const refused = await app.request('/crawl', {
      method: 'POST',
      headers: { authorization: 'Bearer nope', 'content-type': 'application/json' },
      body,
    })
    expect(refused.status).toBe(401)
    const none = pair(undefined).app
    const absent = await none.request('/crawl', {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body,
    })
    expect(absent.status).toBe(404)
  })

  it('refuses a request that is not one of the two', async () => {
    const { app } = pair(crawler())
    for (const body of [
      { op: 'scan', url: 'x' },
      { op: 'page' },
      { op: 'page', url: 'x', extra: 1 },
    ]) {
      const response = await app.request('/crawl', {
        method: 'POST',
        headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      expect(response.status).toBe(400)
    }
  })

  it('takes at most MAX_CRAWL_READS at once, and the client treats the rest as unavailable', async () => {
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const { client } = pair(crawler({ page: () => held.then(() => OK) }))
    const running = Array.from({ length: MAX_CRAWL_READS }, () =>
      client.page('https://shop.example/'),
    )
    await expect(client.page('https://shop.example/')).rejects.toBeInstanceOf(ScannerUnavailable)
    release()
    await Promise.all(running)
    expect(await client.page('https://shop.example/')).toEqual(OK)
  })

  it('refuses an answer the protocol does not have', async () => {
    const bad = { ...OK, outcome: 'surprise' } as unknown as PageResult
    const { client } = pair(crawler({ page: () => Promise.resolve(bad) }))
    await expect(client.page('https://shop.example/')).rejects.toThrow(/protocol/)
  })
})

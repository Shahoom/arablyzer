import { readFileSync } from 'node:fs'
import { DEFAULT_POLICY } from '@arablyzer/egress'
import { DEVELOPMENT_LIMITS } from '@arablyzer/plans'
import type { Report } from '@arablyzer/report-schema'
import {
  MemoryInFlight,
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  MemoryScanStore,
} from '@arablyzer/store'
import { describe, expect, it } from 'vitest'
import { createApp, type ApiDeps } from '../src/app'

const ID = 'AbCdEfGhIjKlMnOpQrSt_-'
const FONT_URL = 'https://shop.example/fonts/brand-ar.ttf'
const NOW = new Date('2026-10-04T12:00:00Z')
const TTF = readFileSync(
  new URL('../../../fixtures/shared/fonts/arablyzer-test-arabic.ttf', import.meta.url),
)

function setup(answer: { status: number; body: Uint8Array } | null = { status: 200, body: TTF }) {
  const store = new MemoryScanStore()
  const fetched: string[] = []
  const deps: ApiDeps = {
    limits: DEVELOPMENT_LIMITS,
    policy: DEFAULT_POLICY,
    resolver: () => Promise.resolve([]),
    turnstile: () => Promise.resolve(true),
    limiter: new MemoryRateLimiter(),
    store,
    queue: new MemoryScanQueue(),
    events: new MemoryScanEvents(20),
    inFlight: new MemoryInFlight(),
    address: () => '203.0.113.9',
    connectionKey: (address) => `key-of-${address}`,
    newId: () => ID,
    now: () => NOW,
    fontFetcher: (url) => {
      fetched.push(url)
      return Promise.resolve({
        response: answer === null ? null : { url, headers: [], truncated: false, ...answer },
      } as never)
    },
  }
  const app = createApp(deps)
  const seed = async (fonts: unknown[] = [font()]) => {
    await store.create({
      id: ID,
      url: 'https://shop.example/',
      createdAt: NOW,
      deleteTokenHash: 'h',
    })
    await store.start(ID, NOW)
    const report = { scan: { status: 'complete' }, facts: { arabicFonts: { fonts } } }
    await store.finish(ID, report as unknown as Report, NOW)
  }
  const get = (font = FONT_URL) =>
    app.request(`/api/reports/${ID}/font-subset?font=${encodeURIComponent(font)}`)
  return { app, seed, get, fetched }
}

const font = () => ({
  family: 'Brand Arabic',
  url: FONT_URL,
  format: 'ttf',
  bytes: TTF.byteLength,
  weight: null,
  style: null,
  characters: 'مرحبا',
  subsetBytes: 1000,
  unicodeRange: 'U+20',
})

describe('GET /api/reports/:id/font-subset', () => {
  it('sends a WOFF2 subset of a font the report lists, and keeps nothing', async () => {
    const { seed, get, fetched } = setup()
    await seed()
    const response = await get()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('font/woff2')
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="brand-arabic-subset.woff2"',
    )
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = new Uint8Array(await response.arrayBuffer())
    expect(String.fromCharCode(...body.subarray(0, 4))).toBe('wOF2')
    expect(body.byteLength).toBeLessThan(TTF.byteLength / 2)
    expect(fetched).toEqual([FONT_URL])
  })

  it('fetches only an address the report lists', async () => {
    const { seed, get, fetched } = setup()
    await seed()
    expect((await get('https://169.254.169.254/latest/meta-data')).status).toBe(404)
    expect((await get('https://other.example/fonts/x.ttf')).status).toBe(404)
    expect(fetched).toEqual([])
  })

  it('refuses a malformed request and an unknown report', async () => {
    const { app, seed } = setup()
    await seed()
    expect((await app.request(`/api/reports/${ID}/font-subset`)).status).toBe(400)
    expect((await app.request(`/api/reports/not-an-id/font-subset?font=${FONT_URL}`)).status).toBe(
      400,
    )
    expect(
      (await app.request(`/api/reports/AbCdEfGhIjKlMnOpQrSt_x/font-subset?font=${FONT_URL}`))
        .status,
    ).toBe(404)
  })

  it('says so when the font cannot be fetched or is not a font', async () => {
    const gone = setup({ status: 404, body: new Uint8Array() })
    await gone.seed()
    expect((await gone.get()).status).toBe(502)
    const notFont = setup({ status: 200, body: new TextEncoder().encode('<html></html>') })
    await notFont.seed()
    expect((await notFont.get()).status).toBe(422)
  })

  it('limits how often one visitor asks', async () => {
    // The font is unavailable each time: the limit counts asks, and no subset (WebAssembly) is
    // made, so the loop takes no time that a slow machine could stretch past the test's own.
    const { seed, get } = setup({ status: 404, body: new Uint8Array() })
    await seed()
    const statuses: number[] = []
    for (let i = 0; i < DEVELOPMENT_LIMITS.attempts.scans + 2; i++)
      statuses.push((await get()).status)
    expect(statuses.slice(0, DEVELOPMENT_LIMITS.attempts.scans)).toEqual(
      Array(DEVELOPMENT_LIMITS.attempts.scans).fill(502),
    )
    expect(statuses.slice(DEVELOPMENT_LIMITS.attempts.scans)).toEqual([429, 429])
  })
})

import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { GscResult } from '@arablyzer/api-contract/codes'
import { executablePathFor } from '@arablyzer/browser/engines'
import { serveSite, type FixtureSite } from '@arablyzer/fixtures'
import { chromium, type Browser } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// The Search Console card on the report page (Chromium alone): drawn from a mocked one-time
// result, hidden when the API has no OAuth client, and never leaving the address with the result's
// id in it. The API is stood in for by fixed answers. `pnpm test:browser` builds the site first.
const DIST = fileURLToPath(new URL('../../dist/', import.meta.url))
const GOLDEN = fileURLToPath(
  new URL('../../../../fixtures/golden/reports/04-rtl-layout.json', import.meta.url),
)
const DONE = 'GscDoneGscDoneGscDone'.padEnd(22, '_').slice(0, 22)
const RESULT_ID = 'R'.repeat(43)

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const RESULT: GscResult = {
  property: { siteUrl: 'sc-domain:shop.example.com', kind: 'domain' },
  period: { start: '2026-08-30', end: '2026-09-26' },
  totals: { clicks: 1234, impressions: 56789, ctr: 0.0217, position: 8.4 },
  queries: [
    { key: 'متجر إلكتروني في الرياض', clicks: 120, impressions: 3400, ctr: 0.035, position: 4.2 },
    { key: 'shop online', clicks: 80, impressions: 2000, ctr: 0.04, position: 6.1 },
  ],
  pages: [
    { key: 'https://shop.example.com/ar/', clicks: 300, impressions: 9000, ctr: 0.03, position: 5 },
  ],
  countries: [{ key: 'sau', clicks: 700, impressions: 20000, ctr: 0.035, position: 7 }],
  inspection: {
    verdict: 'PASS',
    coverageState: 'Submitted and indexed',
    indexingState: 'INDEXING_ALLOWED',
    pageFetchState: 'SUCCESSFUL',
    robotsTxtState: 'ALLOWED',
    lastCrawlTime: '2026-09-20T08:00:00Z',
    googleCanonical: 'https://shop.example.com/ar/',
    userCanonical: 'https://shop.example.com/',
    mobileUsability: { verdict: 'PASS', issues: [] },
  },
  partial: false,
}

const json = (value: unknown, status = 200) => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(value),
})

let root = ''
let site: FixtureSite
let browser: Browser

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'arablyzer-gsc-'))
  await cp(DIST, root, { recursive: true })
  const shell = async (file: string) => ({
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: await readFile(path.join(DIST, file), 'utf8'),
  })
  const report = JSON.parse(await readFile(GOLDEN, 'utf8')) as unknown
  const summary = {
    id: DONE,
    url: 'https://shop.example.com/ar/',
    state: 'complete',
    createdAt: '2026-09-28T12:00:00.000Z',
  }
  await writeFile(
    path.join(root, 'fixture.json'),
    JSON.stringify({
      [`/r/${DONE}`]: await shell('r/index.html'),
      [`/en/r/${DONE}`]: await shell('en/r/index.html'),
      [`/api/scans/${DONE}`]: json(summary),
      [`/api/reports/${DONE}`]: json(report),
    }),
  )
  site = await serveSite(root, { compressText: true, cleanUrls: true })
  const executablePath = executablePathFor('chromium')
  browser = await chromium.launch({ ...(executablePath === undefined ? {} : { executablePath }) })
})

afterAll(async () => {
  await browser.close()
  await site.close()
  await rm(root, { recursive: true, force: true })
})

/** Opens the report, with Search Console on or off, and the result the API would give once. */
async function open(options: { enabled: boolean; query?: string; lang?: 'ar' | 'en' }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== site.origin) return route.abort('blockedbyclient')
    if (url.pathname === '/api/gsc/status') return route.fulfill(json({ enabled: options.enabled }))
    if (url.pathname === `/api/gsc/results/${RESULT_ID}`) {
      results.push(url.pathname)
      // Given once: the next read finds it gone.
      return route.fulfill(results.length === 1 ? json(RESULT) : json({ error: 'not-found' }, 404))
    }
    return route.fallback()
  })
  const results: string[] = []
  const tab = await context.newPage()
  const lang = options.lang ?? 'ar'
  await tab.goto(site.url(`${lang === 'ar' ? '' : '/en'}/r/${DONE}${options.query ?? ''}`))
  await tab.waitForSelector('#summary-title', { timeout: 20_000 })
  return { tab, results, close: () => context.close() }
}

describe('the Search Console card, in Chromium', () => {
  it('is not on the page at all when the site has no Google client', async () => {
    const { tab, close } = await open({ enabled: false })
    await tab.waitForLoadState('networkidle')
    expect(await tab.locator('#gsc-title').count()).toBe(0)
    expect(await tab.getByText('اربط Search Console').count()).toBe(0)
    await close()
  })

  it('offers the connection, in Arabic and English, to the API’s start route', async () => {
    for (const [lang, label] of [
      ['ar', 'اربط Search Console'],
      ['en', 'Connect Search Console'],
    ] as const) {
      const { tab, close } = await open({ enabled: true, lang })
      const button = tab.getByRole('link', { name: label })
      await button.waitFor({ timeout: 10_000 })
      expect(await button.getAttribute('href')).toBe(`/api/gsc/start?report=${DONE}&lang=${lang}`)
      expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44)
      await close()
    }
  })

  it('draws the result once, with Arabic queries as they are, and takes the id out of the address', async () => {
    const { tab, results, close } = await open({ enabled: true, query: `?gsc=${RESULT_ID}` })
    await tab.locator('#gsc-title').waitFor({ timeout: 10_000 })
    const card = tab.locator('section[aria-labelledby="gsc-title"]')
    await card.getByText('متجر إلكتروني في الرياض').waitFor({ timeout: 10_000 })
    const text = await card.innerText()
    expect(text).toContain('1,234')
    expect(text).toContain('SAU')
    expect(text).toContain('sc-domain:shop.example.com')
    expect(text).toContain('Submitted and indexed')
    // The card has the focus, as the visitor came back to a long page.
    expect(await tab.evaluate(() => document.activeElement?.id)).toBe('gsc-title')
    expect(new URL(tab.url()).search).toBe('')
    expect(results).toHaveLength(1)
    // It does not scroll sideways at a phone's width.
    expect(
      await tab.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0)
    // Hiding it brings the connection back; the result is gone from the page.
    await card.getByRole('button', { name: 'أخفِ هذه البيانات' }).click()
    await card.getByRole('link', { name: 'اربط Search Console' }).waitFor()
    expect(await card.getByText('متجر إلكتروني في الرياض').count()).toBe(0)
    await close()
  })

  it('says so when the visitor said no', async () => {
    const { tab, close } = await open({ enabled: true, query: '?gsc=denied' })
    await tab.getByText('لم تسمح بالوصول').waitFor({ timeout: 10_000 })
    expect(new URL(tab.url()).search).toBe('')
    await close()
  })
})

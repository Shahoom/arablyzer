import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { executablePathFor } from '@arablyzer/browser'
import { createPolicy } from '@arablyzer/egress'
import { scan } from '@arablyzer/engine'
import { serveSite, type FixtureSite } from '@arablyzer/fixtures'
import type { Report } from '@arablyzer/report-schema'
import { chromium, type Browser } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The Arabic X-ray and the country fit cards (docs/design/plans/arabic-native.md §3, §6) as a
// visitor sees them: golden report 07 with both facts added, served as in report.browser.test.ts,
// rendered in Chromium and scanned by Arablyzer for the rules a report page must pass.
const DIST = fileURLToPath(new URL('../../dist/', import.meta.url))
const GOLDEN = fileURLToPath(
  new URL('../../../../fixtures/golden/reports/07-checkout-form.json', import.meta.url),
)
const ID = 'XrayXrayXrayXrayXray_6'
// A 1 x 1 JPEG: the card draws its circles over whatever picture the report carries.
const JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='

let root = ''
let site: FixtureSite

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'arablyzer-xray-page-'))
  await cp(DIST, root, { recursive: true })
  const page = await readFile(path.join(DIST, 'r', 'index.html'), 'utf8')
  const report = JSON.parse(await readFile(GOLDEN, 'utf8')) as Report
  const word = (x: number, y: number) => ({
    text: 'ڤيلا',
    kind: 'glyph' as const,
    box: { x, y, width: 60, height: 24 },
  })
  const withFacts: Report = {
    ...report,
    facts: {
      ...report.facts,
      countryFit: {
        country: 'SA',
        confidence: 'strong',
        percent: 67,
        judged: 3,
        signals: [{ kind: 'currency', country: 'SA', value: 'SAR' }],
        items: [
          { id: 'currency', status: 'ok', detail: 'SAR' },
          { id: 'phone', status: 'gap', detail: '0501234567' },
          { id: 'vat', status: 'ok', detail: '' },
        ],
      },
      xray: {
        percent: 94,
        engines: [
          {
            engine: 'chromium',
            total: 40,
            broken: 3,
            truncated: false,
            viewport: { width: 390, height: 844 },
            words: [word(120, 200), word(40, 300)],
            image: JPEG,
          },
          {
            engine: 'firefox',
            total: 40,
            broken: 0,
            truncated: false,
            viewport: { width: 390, height: 844 },
            words: [],
            image: null,
          },
        ],
      },
    },
  }
  const json = (value: unknown) => ({
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  })
  await writeFile(
    path.join(root, 'fixture.json'),
    JSON.stringify({
      [`/r/${ID}`]: { headers: { 'content-type': 'text/html; charset=utf-8' }, body: page },
      [`/api/scans/${ID}`]: json({
        id: ID,
        url: 'http://store.example/checkout',
        state: 'complete',
        createdAt: '2026-09-28T12:00:00.000Z',
      }),
      [`/api/reports/${ID}`]: json(withFacts),
    }),
  )
  site = await serveSite(root, { compressText: true, cleanUrls: true })
})

afterAll(async () => {
  await site.close()
  await rm(root, { recursive: true, force: true })
})

let browser: Browser
beforeAll(async () => {
  const executablePath = executablePathFor('chromium')
  browser = await chromium.launch(executablePath === undefined ? {} : { executablePath })
}, 60_000)
afterAll(async () => {
  await browser.close()
})

describe('the Arabic X-ray and country fit cards, rendered in Chromium', () => {
  it.each([390, 1440])(
    'draws a ring over each broken word at %i px wide',
    async (width) => {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      try {
        await page.goto(site.url(`/r/${ID}`))
        const card = page.locator('section[aria-labelledby="xray-title"]')
        await card.waitFor({ timeout: 15_000 })
        expect(await card.locator('ellipse').count()).toBe(4)
        expect(await card.locator('img').count()).toBe(1)
        expect(await card.locator('img').getAttribute('src')).toMatch(/^data:image\/jpeg;base64,/)
        expect(await card.getByText('سلامة العربية 94٪').count()).toBe(1)
        expect(await page.getByText(/جاهزة بنسبة 67٪/).count()).toBe(1)
        // CSP allows no style attributes; nothing in either card sets one.
        expect(
          await page
            .locator('#xray-title, #country-title')
            .evaluateAll(
              (titles) =>
                titles.flatMap((title) =>
                  Array.from(title.parentElement?.querySelectorAll('[style]') ?? []),
                ).length,
            ),
        ).toBe(0)
        // The card fits the screen, and every ring sits on the picture.
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true)
        const rings = await card.locator('svg').boundingBox()
        const picture = await card.locator('img').boundingBox()
        expect(rings?.width).toBeCloseTo(picture?.width ?? 0, 0)
        expect(rings?.height).toBeCloseTo(picture?.height ?? 0, 0)
        if (process.env.XRAY_SHOT !== undefined) {
          await card.screenshot({
            path: `${process.env.XRAY_SHOT}-${String(width)}.png`,
            scale: 'css',
          })
        }
      } finally {
        await page.close()
      }
    },
    60_000,
  )

  it('breaks no rule a report page must pass', async () => {
    const report = await scan(site.url(`/r/${ID}`), {
      policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
      render: { engines: ['chromium'], networkIsolated: true },
    })
    const failed = report.rules
      .filter((rule) => rule.status === 'fail' || rule.status === 'error')
      .map((rule) => rule.id)
      .filter((id) => !['page-noindex', 'h1-missing', 'js-only-content'].includes(id))
    expect(failed).toEqual([])
  }, 180_000)
})

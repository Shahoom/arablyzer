import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { executablePathFor } from '@arablyzer/browser'
import { serveSite, type FixtureSite } from '@arablyzer/fixtures'
import type { Report } from '@arablyzer/report-schema'
import { chromium, type Browser } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The cards of the second set of Arabic-native features (docs/design/plans/arabic-native.md §7 to
// §14) as a visitor sees them in Chromium: the dialect and the AI-training filters on a report
// page, and the look-alike, PDF, misspelling, AI visibility and per-country cards in a tool's result.
// Golden report 07 with the facts added, the site's built pages, and the API answered by the test.
const DIST = fileURLToPath(new URL('../../dist/', import.meta.url))
const GOLDEN = fileURLToPath(
  new URL('../../../../fixtures/golden/reports/07-checkout-form.json', import.meta.url),
)
const ID = 'NativeTwoNativeTwoNa_7'
const ADDRESS = 'http://store.example/checkout'

const FACTS = {
  dialect: {
    outcome: 'classified',
    words: 120,
    label: 'gulf',
    mix: { msa: 30, gulf: 60, egyptian: 10, levantine: 0, maghrebi: 0 },
    hits: { msa: 3, gulf: 6, egyptian: 1, levantine: 0, maghrebi: 0 },
    headings: 'msa',
    markers: [
      { word: 'وايد', dialect: 'gulf' },
      { word: 'ازاي', dialect: 'egyptian' },
    ],
    country: 'EG',
    fits: false,
  },
  aiTraining: {
    outcome: 'tested',
    words: 164,
    lines: 6,
    passes: false,
    checks: [
      {
        group: 'language',
        id: 'language_score',
        measured: 1,
        threshold: 0.711,
        limit: 'min',
        pass: true,
        applied: false,
        proxy: true,
      },
      {
        group: 'gopher-repetition',
        id: 'dup_line_frac',
        measured: 0.846,
        threshold: 0.304,
        limit: 'max',
        pass: false,
        applied: true,
        proxy: false,
      },
      {
        group: 'gopher-repetition',
        id: 'top_2_gram',
        measured: 0.211,
        threshold: 0.197,
        limit: 'max',
        pass: false,
        applied: true,
        proxy: false,
      },
      {
        group: 'fineweb-quality',
        id: 'line_punct_ratio',
        measured: 0.833,
        threshold: 0.143,
        limit: 'min',
        pass: true,
        applied: true,
        proxy: false,
      },
      {
        group: 'gopher-quality',
        id: 'gopher_enough_stop_words',
        measured: 9,
        threshold: 2,
        limit: 'min',
        pass: true,
        applied: true,
        proxy: false,
      },
      {
        group: 'c4',
        id: 'too_few_sentences',
        measured: 10,
        threshold: 5,
        limit: 'min',
        pass: true,
        applied: false,
        proxy: true,
      },
    ],
  },
  lookalikes: {
    domain: 'alwaha.com.sa',
    candidates: 100,
    asked: 100,
    ct: 'partial',
    found: [
      {
        domain: 'alwaha.net',
        kind: 'tld',
        address: true,
        mail: true,
        firstSeen: '2026-09-20',
        certificates: 2,
        recent: true,
      },
      {
        domain: 'al7waha.com.sa',
        kind: 'arabizi',
        address: true,
        mail: false,
        firstSeen: null,
        certificates: 0,
        recent: false,
      },
    ],
  },
  pdfs: {
    linked: 4,
    files: [
      {
        url: 'https://www.alwaha.com.sa/files/annual-report.pdf',
        outcome: 'read',
        bytes: 123456,
        pages: 12,
        pagesRead: 12,
        title: null,
        language: null,
        issues: [
          { kind: 'reversed', measure: 0.9, example: 'ةيبرعلا' },
          { kind: 'no-title', measure: 0, example: '' },
        ],
      },
      {
        url: 'https://www.alwaha.com.sa/files/big.pdf',
        outcome: 'too-large',
        bytes: 0,
        pages: 0,
        pagesRead: 0,
        title: null,
        language: null,
        issues: [],
      },
    ],
  },
  suggest: {
    calls: 6,
    stopped: false,
    terms: [
      {
        term: 'قهوة',
        written: true,
        variants: [
          {
            text: 'قهوه',
            kind: 'ta-marbuta',
            typed: true,
            suggestion: 'قهوه سريعه',
            covered: false,
          },
          { text: 'qhoa', kind: 'arabizi', typed: false, suggestion: null, covered: false },
        ],
      },
    ],
  },
  aiVisibility: {
    brand: 'قهوة الواحة',
    domain: 'alwaha.com.sa',
    questions: ['ما أفضل المواقع أو المتاجر لـقهوة مختصة؟'],
    calls: 4,
    providers: [
      {
        provider: 'openai',
        model: 'gpt-6-luna',
        status: 'ok',
        answers: [
          {
            question: 'ما أفضل المواقع أو المتاجر لـقهوة مختصة؟',
            status: 'answered',
            mentioned: false,
            cited: false,
            citations: ['https://rival.net/x'],
            competitors: ['rival.net'],
          },
        ],
      },
      { provider: 'anthropic', model: 'claude-sonnet-5-5', status: 'refused', answers: [] },
    ],
  },
  cruxCountries: {
    origin: 'https://alwaha.com.sa',
    month: '202609',
    bytes: 3221225472,
    countries: [
      { country: 'SA', found: true, good: { lcp: 0.91, inp: 0.97, cls: 0.99 }, rank: 5000 },
      { country: 'EG', found: true, good: { lcp: 0.42, inp: 0.8, cls: null }, rank: null },
      { country: 'MA', found: false, good: { lcp: null, inp: null, cls: null }, rank: null },
    ],
  },
} as const

let root = ''
let site: FixtureSite
let withFacts: Report
let browser: Browser

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'arablyzer-native2-page-'))
  await cp(DIST, root, { recursive: true })
  const page = await readFile(path.join(DIST, 'r', 'index.html'), 'utf8')
  const golden = JSON.parse(await readFile(GOLDEN, 'utf8')) as Report
  withFacts = { ...golden, facts: { ...golden.facts, ...FACTS } } as unknown as Report
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
        url: ADDRESS,
        state: 'complete',
        createdAt: '2026-10-04T12:00:00.000Z',
      }),
      [`/api/reports/${ID}`]: json(withFacts),
    }),
  )
  site = await serveSite(root, { compressText: true, cleanUrls: true })
  const executablePath = executablePathFor('chromium')
  browser = await chromium.launch(executablePath === undefined ? {} : { executablePath })
}, 90_000)

afterAll(async () => {
  await browser.close()
  await site.close()
  await rm(root, { recursive: true, force: true })
})

/** No card sets a style attribute (the CSP allows none), and the page fits the screen. */
async function sound(page: import('playwright-core').Page, titles: string[]) {
  expect(
    await page
      .locator(titles.map((title) => `#${title}`).join(','))
      .evaluateAll(
        (nodes) =>
          nodes.flatMap((node) => Array.from(node.parentElement?.querySelectorAll('[style]') ?? []))
            .length,
      ),
  ).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
}

describe('the dialect and AI-training cards on a report page, in Chromium', () => {
  it.each([390, 1440])(
    'show the variety, the mix and each filter at %i px wide',
    async (width) => {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      try {
        const seen: string[] = []
        page.on('pageerror', (error) => seen.push(`error: ${error.message}`))
        page.on('console', (message) => seen.push(`${message.type()}: ${message.text()}`))
        await page.goto(site.url(`/r/${ID}`))
        const dialect = page.locator('section[aria-labelledby="dialect-title"]')
        await dialect.waitFor({ timeout: 15_000 }).catch(async (error: unknown) => {
          throw new Error(`${seen.join(' | ')} ${await page.locator('body').innerText()}`, {
            cause: error,
          })
        })
        expect(await dialect.getByText('نص الصفحة أقرب إلى الخليجية').count()).toBe(1)
        expect(await dialect.locator('li.chip').count()).toBe(5)
        expect(await dialect.getByText(/لا تُحكى هذه اللهجة في مصر/).count()).toBe(1)
        const training = page.locator('section[aria-labelledby="training-title"]')
        expect(await training.getByText('سقط نصك في 2 من 4 فلتراً').count()).toBe(1)
        expect(await training.locator('li').count()).toBe(6)
        await sound(page, ['dialect-title', 'training-title'])
        if (process.env.NATIVE2_SHOT !== undefined) {
          await page.locator('section[aria-labelledby="dialect-title"]').screenshot({
            path: `${process.env.NATIVE2_SHOT}-report-${String(width)}.png`,
            scale: 'css',
          })
        }
      } finally {
        await page.close()
      }
    },
    60_000,
  )
})

describe('the cards of the services beside the site, in a tool’s result, in Chromium', () => {
  it.each([390, 1440])(
    'show the look-alikes, PDFs, misspellings, AI answers and countries at %i px wide',
    async (width) => {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      await context.route('**/*', async (route) => {
        if (new URL(route.request().url()).origin === site.origin) await route.fallback()
        else await route.abort('blockedbyclient')
      })
      const tab = await context.newPage()
      const json = (value: unknown, status = 200) => ({
        status,
        contentType: 'application/json',
        body: JSON.stringify(value),
      })
      await tab.route('**/api/scans', (route) => route.fulfill(json({ id: ID }, 202)))
      await tab.route(`**/api/scans/${ID}`, (route) =>
        route.fulfill(
          json({
            id: ID,
            url: ADDRESS,
            createdAt: '2026-10-04T12:00:00.000Z',
            tool: 'lookalike-domains',
            state: 'complete',
          }),
        ),
      )
      await tab.route(`**/api/scans/${ID}/events`, (route) =>
        route.fulfill({
          contentType: 'text/event-stream',
          body: `id: 1\ndata: ${JSON.stringify({ type: 'done', state: 'complete' })}\n\n`,
        }),
      )
      await tab.route(`**/api/reports/${ID}`, (route) => route.fulfill(json(withFacts)))
      try {
        await tab.goto(site.url('/tools/lookalike-domains'))
        await tab.locator('form button[type="submit"]:not([disabled])').waitFor({ timeout: 20_000 })
        await tab.fill('#tool-url', ADDRESS)
        await tab.click('form button[type="submit"]')
        await tab
          .locator('section[aria-labelledby="lookalikes-title"]')
          .waitFor({ timeout: 20_000 })
        const lookalikes = tab.locator('section[aria-labelledby="lookalikes-title"]')
        expect(await lookalikes.getByText('alwaha.net').count()).toBe(1)
        expect(await lookalikes.getByText('2026-09-20').count()).toBe(1)
        const pdfs = tab.locator('section[aria-labelledby="pdfs-title"]')
        expect(await pdfs.getByText('حروف معكوسة').count()).toBe(1)
        expect(await pdfs.getByText('أكبر من 15 ميغابايت').count()).toBe(1)
        const suggest = tab.locator('section[aria-labelledby="suggest-title"]')
        expect(await suggest.getByText('يكتبه الناس', { exact: true }).count()).toBe(1)
        const ai = tab.locator('section[aria-labelledby="ai-title"]')
        expect(await ai.getByText('OpenAI').count()).toBe(1)
        expect(await ai.getByText('رفض المفتاح').count()).toBe(1)
        const crux = tab.locator('section[aria-labelledby="crux-title"]')
        expect(await crux.locator('tbody tr').count()).toBe(3)
        expect(await crux.getByText('91٪').count()).toBe(1)
        await sound(tab, [
          'lookalikes-title',
          'pdfs-title',
          'suggest-title',
          'ai-title',
          'crux-title',
        ])
        if (process.env.NATIVE2_SHOT !== undefined) {
          await crux.screenshot({
            path: `${process.env.NATIVE2_SHOT}-crux-${String(width)}.png`,
            scale: 'css',
          })
          await lookalikes.screenshot({
            path: `${process.env.NATIVE2_SHOT}-look-${String(width)}.png`,
            scale: 'css',
          })
        }
      } finally {
        await context.close()
      }
    },
    90_000,
  )
})

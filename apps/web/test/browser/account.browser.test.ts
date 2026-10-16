import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { executablePathFor } from '@arablyzer/browser/engines'
import { serveSite, type FixtureSite } from '@arablyzer/fixtures'
import { chromium, type Browser, type BrowserContext, type Route } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// The sign-in and account pages (Chromium alone): Google's script stood in for by a few lines, the
// API by fixed answers. The site is built here with an OAuth client id (astro build, a few
// seconds), since the default build has none and these pages then say accounts are off.
const WEB = fileURLToPath(new URL('../../', import.meta.url))
const DIST = path.join(WEB, 'dist')
const GOLDEN_REPORT = path.join(WEB, '../../fixtures/golden/reports/07-checkout-form.json')
const CLIENT_ID = 'browser-test.apps.googleusercontent.com'
const run = promisify(execFile)

vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 })

const json = (value: unknown, status = 200) => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(value),
})
const SOON = '2026-10-09T12:00:00.000Z'
const PNG_BYTES = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
)
const PDF_JOB = {
  id: 'PPPPPPPPPPPPPPPPPPPPPP',
  kind: 'scan',
  subject: 'BBBBBBBBBBBBBBBBBBBBBB',
  base: null,
  language: 'en',
  state: 'queued',
  error: null,
  bytes: null,
  createdAt: '2026-10-09T12:00:00.000Z',
  finishedAt: null,
}
const SITE_ID = 'AAAAAAAAAAAAAAAAAAAAAA'
const LAST = {
  id: 'BBBBBBBBBBBBBBBBBBBBBB',
  url: 'https://example.com/',
  state: 'complete',
  score: 82,
  createdAt: SOON,
  siteId: SITE_ID,
}
const SAVED = {
  id: SITE_ID,
  url: 'https://example.com/',
  createdAt: SOON,
  lastScan: LAST,
  monitor: null,
  crawl: null,
}
const MONITOR = {
  everyDays: 7,
  paused: false,
  nextRunAt: '2026-10-16T12:00:00.000Z',
  failures: 0,
  trend: [
    { scanId: 'CCCCCCCCCCCCCCCCCCCCCC', state: 'complete', score: 90, at: SOON },
    { scanId: 'DDDDDDDDDDDDDDDDDDDDDD', state: 'complete', score: 82, at: SOON },
  ],
}
const ALERTS = {
  webhook: null,
  dropThreshold: 10,
  onCritical: true,
  onDown: true,
  weeklySummary: false,
  email: { available: false, enabled: false },
}
const HOOK_ALERTS = {
  ...ALERTS,
  webhook: { host: 'hooks.slack.com', kind: 'slack', failures: 0, disabled: false },
}
const ACCOUNT = {
  id: 'u1',
  email: 'ali@example.com',
  name: 'علي',
  language: 'ar',
  createdAt: '2026-10-01T00:00:00.000Z',
}

/** Google's script, in a few lines: it keeps the page's callback where the test can call it. */
const GIS = `
window.google = { accounts: { id: {
  initialize(config) { window.__gis = { config, prompted: 0, buttons: 0 } },
  renderButton(parent) { window.__gis.buttons++; parent.setAttribute('data-gis-button', '') },
  prompt() { window.__gis.prompted++ },
  cancel() {},
} } }
`

let built = ''
let site: FixtureSite
let plain: FixtureSite
let browser: Browser

beforeAll(async () => {
  built = await mkdtemp(path.join(tmpdir(), 'arablyzer-accounts-'))
  await run('pnpm', ['exec', 'astro', 'build', '--outDir', built], {
    cwd: WEB,
    env: {
      ...process.env,
      ARABLYZER_SITE: 'https://arablyzer.example',
      PUBLIC_AUTH_GOOGLE_CLIENT_ID: CLIENT_ID,
    },
    timeout: 170_000,
  })
  site = await serveSite(built, { compressText: true, cleanUrls: true })
  plain = await serveSite(DIST, { compressText: true, cleanUrls: true })
  const executablePath = executablePathFor('chromium')
  browser = await chromium.launch({ ...(executablePath === undefined ? {} : { executablePath }) })
})

afterAll(async () => {
  await browser.close()
  await site.close()
  await plain.close()
  await rm(built, { recursive: true, force: true })
})

interface Scenario {
  /** The account GET answers: a signed-in account, or nobody. */
  account: typeof ACCOUNT | null
  /** Whether Google's script loads. */
  google: boolean
  deleteStatus?: number
  deleteBody?: unknown
  /** The saved sites and their plan's limit, and the history (M4.2). */
  sites?: unknown[]
  limit?: number
  scans?: unknown[]
  /** What monitoring answers: the monitoring numbers, and the alerts as saved. */
  monitoring?: { limit: number; everyDays: number }
  alerts?: unknown
  /** A saved site's score history, and what the comparison routes answer (M4.6). */
  history?: unknown
  compare?: { status: number; body: unknown }
  /** White-label (M4.7): the brand as saved, and whether the plan has it; and the PDF a click asks for. */
  brand?: { available: boolean; name: string; color: string | null; hasLogo: boolean }
  pdf?: { status: number; body: unknown }
  /** A shared report page (M4.7): the scan, and the brand its account has, if any. */
  report?: {
    id: string
    brand: { name: string; color: string | null; hasLogo: boolean; credit: boolean } | null
  }
  /** What adding a site answers, in place of a created site. */
  addStatus?: number
  addBody?: unknown
  /** The window's width (a phone's 390 by default) and the system's colour scheme. */
  width?: number
  scheme?: 'light' | 'dark'
}

/** A context whose requests to the site's API and to Google are answered by the scenario. */
async function open(base: FixtureSite, scenario: Scenario) {
  const context: BrowserContext = await browser.newContext({
    viewport: { width: scenario.width ?? 390, height: 844 },
    ...(scenario.scheme === undefined ? {} : { colorScheme: scenario.scheme }),
  })
  const seen: { method: string; path: string; body: string | null }[] = []
  const external: string[] = []
  await context.route('**/*', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === 'https://accounts.google.com') {
      external.push(url.pathname)
      if (url.pathname === '/gsi/client') {
        return scenario.google
          ? route.fulfill({
              status: 200,
              headers: { 'content-type': 'text/javascript' },
              body: GIS,
            })
          : route.abort('blockedbyclient')
      }
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: 'Google',
      })
    }
    if (url.origin !== base.origin) return route.abort('blockedbyclient')
    if (
      scenario.report !== undefined &&
      (url.pathname === `/r/${scenario.report.id}` ||
        url.pathname === `/en/r/${scenario.report.id}`)
    ) {
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: await readFile(
          path.join(built, url.pathname.startsWith('/en/') ? 'en' : '.', 'r', 'index.html'),
        ),
      })
    }
    if (url.pathname.startsWith('/api/')) {
      seen.push({ method: request.method(), path: url.pathname, body: request.postData() })
      if (url.pathname === '/api/account' && request.method() === 'GET') {
        return route.fulfill(
          scenario.account === null ? json({ error: 'unauthorized' }, 401) : json(scenario.account),
        )
      }
      if (url.pathname === '/api/account' && request.method() === 'PATCH') {
        const language = (JSON.parse(request.postData() ?? '{}') as { language: string }).language
        return route.fulfill(json({ ...(scenario.account ?? ACCOUNT), language }))
      }
      if (url.pathname === '/api/account' && request.method() === 'DELETE') {
        return scenario.deleteStatus === undefined || scenario.deleteStatus === 204
          ? route.fulfill({ status: 204 })
          : route.fulfill(json(scenario.deleteBody, scenario.deleteStatus))
      }
      if (url.pathname === '/api/sites' && request.method() === 'GET') {
        return route.fulfill(
          json({
            sites: scenario.sites ?? [],
            limit: scenario.limit ?? 3,
            monitoring: scenario.monitoring ?? { limit: 1, everyDays: 7 },
            crawlPages: 50,
          }),
        )
      }
      if (url.pathname === '/api/sites' && request.method() === 'POST') {
        if (scenario.addStatus !== undefined) {
          return route.fulfill(json(scenario.addBody, scenario.addStatus))
        }
        const asked = (JSON.parse(request.postData() ?? '{}') as { url: string }).url
        return route.fulfill(
          json(
            {
              id: 'NNNNNNNNNNNNNNNNNNNNNN',
              url: asked,
              createdAt: SOON,
              lastScan: null,
              monitor: null,
              crawl: null,
            },
            201,
          ),
        )
      }
      if (url.pathname.endsWith('/monitor') && request.method() === 'PUT') {
        const { enabled } = JSON.parse(request.postData() ?? '{}') as { enabled: boolean }
        return route.fulfill(json({ monitor: enabled ? MONITOR : null }))
      }
      if (scenario.report !== undefined && url.pathname.startsWith('/api/scans/')) {
        return route.fulfill(
          json({
            id: scenario.report.id,
            url: 'http://store.example/checkout',
            state: 'complete',
            createdAt: SOON,
          }),
        )
      }
      if (scenario.report !== undefined && url.pathname === `/api/reports/${scenario.report.id}`) {
        return route.fulfill(json(JSON.parse(await readFile(GOLDEN_REPORT, 'utf8'))))
      }
      if (
        scenario.report !== undefined &&
        url.pathname === `/api/reports/${scenario.report.id}/brand`
      ) {
        return route.fulfill(
          scenario.report.brand === null
            ? json({ error: 'not-found' }, 404)
            : json(scenario.report.brand),
        )
      }
      if (scenario.report !== undefined && url.pathname.endsWith('/brand/logo')) {
        return route.fulfill({
          status: 200,
          headers: { 'content-type': 'image/png' },
          body: Buffer.from(PNG_BYTES),
        })
      }
      if (url.pathname === '/api/account/brand' && scenario.brand !== undefined) {
        const settings = (over: object = {}) => ({
          ...scenario.brand,
          logoType: scenario.brand?.hasLogo === true ? 'image/png' : null,
          credit: true,
          colorFallback: false,
          updatedAt: SOON,
          ...over,
        })
        if (request.method() === 'PUT') {
          const sent = JSON.parse(request.postData() ?? '{}') as {
            name: string
            color: string | null
          }
          return route.fulfill(json(settings({ ...sent, colorFallback: sent.color === '#ffff00' })))
        }
        return route.fulfill(json(settings()))
      }
      if (url.pathname === '/api/account/brand/logo' && scenario.brand !== undefined) {
        if (request.method() === 'GET') {
          return route.fulfill({
            status: 200,
            headers: { 'content-type': 'image/png' },
            body: Buffer.from(PNG_BYTES),
          })
        }
        if (request.method() === 'PUT') {
          const sent = request.postDataBuffer()
          return route.fulfill(
            sent?.subarray(0, 4).toString('hex') === '89504e47'
              ? json({
                  ...scenario.brand,
                  hasLogo: true,
                  logoType: 'image/png',
                  credit: true,
                  colorFallback: false,
                  updatedAt: SOON,
                })
              : json({ error: 'bad-request', logo: 'type' }, 400),
          )
        }
        return route.fulfill(
          json({
            ...scenario.brand,
            hasLogo: false,
            logoType: null,
            credit: true,
            colorFallback: false,
            updatedAt: SOON,
          }),
        )
      }
      if (
        url.pathname === '/api/pdf' &&
        request.method() === 'POST' &&
        scenario.pdf !== undefined
      ) {
        return route.fulfill(json(scenario.pdf.body, scenario.pdf.status))
      }
      if (
        url.pathname.startsWith('/api/pdf/') &&
        request.method() === 'GET' &&
        scenario.pdf !== undefined
      ) {
        return route.fulfill(
          json({
            ...(scenario.pdf.body as object),
            state: 'done',
            bytes: 90_000,
            finishedAt: SOON,
          }),
        )
      }
      if (url.pathname === '/api/account/alerts' && request.method() === 'GET') {
        return route.fulfill(json(scenario.alerts ?? ALERTS))
      }
      if (url.pathname === '/api/account/alerts' && request.method() === 'PUT') {
        return route.fulfill(json({ ...HOOK_ALERTS, secret: 'S'.repeat(43) }))
      }
      if (url.pathname === '/api/account/alerts/test') {
        return route.fulfill(json({ ok: true, status: 204 }))
      }
      if (url.pathname.startsWith('/api/sites/') && request.method() === 'DELETE') {
        return route.fulfill({ status: 204 })
      }
      if (url.pathname.endsWith('/scans') && request.method() === 'POST') {
        return route.fulfill(
          json({ id: 'SSSSSSSSSSSSSSSSSSSSSS', deleteToken: 'T'.repeat(43) }, 202),
        )
      }
      if (url.pathname.endsWith('/history')) return route.fulfill(json(scenario.history))
      if (url.pathname.startsWith('/api/compare/')) {
        return route.fulfill(json(scenario.compare?.body, scenario.compare?.status ?? 200))
      }
      if (url.pathname === '/api/account/scans') {
        return route.fulfill(json({ scans: scenario.scans ?? [], historyDays: 30 }))
      }
      if (url.pathname === '/api/session/one-tap') return route.fulfill(json(ACCOUNT))
      if (url.pathname === '/api/session/google') {
        return route.fulfill(json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' }))
      }
      if (url.pathname === '/api/session' && request.method() === 'DELETE') {
        return route.fulfill({ status: 204 })
      }
      return route.fulfill(json({ error: 'not-found' }, 404))
    }
    return route.fallback()
  })
  const tab = await context.newPage()
  return { tab, seen, external, base, close: () => context.close() }
}

describe('the sign-in page, in Chromium', () => {
  it('draws Google’s button and One Tap, and a credential goes to the API once, in the body', async () => {
    const { tab, seen, external, base, close } = await open(site, { account: null, google: true })
    await tab.goto(base.url('/login'))
    await tab.locator('[data-gis-button]').waitFor({ timeout: 15_000 })
    const gis = await tab.evaluate(
      () => window.__gis as { config: { client_id: string }; prompted: number },
    )
    expect(gis.config.client_id).toBe(CLIENT_ID)
    expect(gis.prompted).toBe(1)
    expect(external).toContain('/gsi/client')
    expect(seen.filter((call) => call.path === '/api/session/one-tap')).toHaveLength(0)
    await tab.evaluate(() => {
      ;(
        window.__gis as { config: { callback: (r: { credential: string }) => void } }
      ).config.callback({
        credential: 'header.payload.signature',
      })
    })
    await tab.waitForURL('**/app')
    const taps = seen.filter((call) => call.path === '/api/session/one-tap')
    expect(taps).toHaveLength(1)
    expect(taps[0]?.method).toBe('POST')
    expect(JSON.parse(taps[0]?.body ?? '{}')).toEqual({ credential: 'header.payload.signature' })
    expect(taps[0]?.path).not.toContain('header')
    await close()
  })

  it('offers Google’s own page when its script cannot load, and goes there alone', async () => {
    const { tab, seen, base, close } = await open(site, { account: null, google: false })
    await tab.goto(base.url('/en/login'))
    const button = tab.getByRole('button', { name: 'Sign in with Google' })
    await button.waitFor({ timeout: 15_000 })
    expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    await Promise.all([tab.waitForURL('https://accounts.google.com/**'), button.click()])
    const starts = seen.filter((call) => call.path === '/api/session/google')
    expect(starts).toHaveLength(1)
    expect(JSON.parse(starts[0]?.body ?? '{}')).toEqual({ lang: 'en' })
    await close()
  })

  it('says why a return from Google ended without an account, and takes it out of the address', async () => {
    const { tab, base, close } = await open(site, { account: null, google: true })
    await tab.goto(base.url('/en/login?error=email_not_verified'))
    await tab.getByText('Google did not confirm your email address').waitFor({ timeout: 15_000 })
    expect(new URL(tab.url()).search).toBe('')
    await close()
  })

  it('sends a signed-in visitor on to the dashboard, from the sign-in page and from the account address', async () => {
    for (const [from, to] of [
      ['/login', '**/app'],
      ['/en/login', '**/en/app'],
      ['/account', '**/app'],
      ['/en/account', '**/en/app'],
    ] as const) {
      const { tab, base, close } = await open(site, { account: ACCOUNT, google: true })
      await tab.goto(base.url(from))
      await tab.waitForURL(to)
      await close()
    }
  })

  it('still shows the sign-in on the account address to a visitor who is signed out', async () => {
    const { tab, base, close } = await open(site, { account: null, google: true })
    await tab.goto(base.url('/en/account'))
    await tab.locator('[data-gis-button]').waitFor({ timeout: 15_000 })
    expect(new URL(tab.url()).pathname).toBe('/en/account')
    await close()
  })

  it('has the link in the header and no horizontal scroll at a phone’s width', async () => {
    const { tab, base, close } = await open(site, { account: null, google: true })
    await tab.goto(base.url('/login'))
    await tab.locator('h1').waitFor()
    expect(await tab.locator('header a[href="/account"]').count()).toBeGreaterThan(0)
    expect(
      await tab.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0)
    await close()
  })
})

describe('the account page of the dashboard, in Chromium', () => {
  it('shows the account, sets the language of an account that has none, and signs out', async () => {
    const { tab, seen, base, close } = await open(site, {
      account: { ...ACCOUNT, language: null as never },
      google: true,
    })
    await tab.goto(base.url('/en/app/account'))
    await tab.getByText('ali@example.com').waitFor({ timeout: 15_000 })
    await tab.waitForFunction(() => document.querySelector('main [aria-pressed="true"]') !== null)
    const patches = seen.filter((call) => call.method === 'PATCH')
    expect(patches).toHaveLength(1)
    expect(JSON.parse(patches[0]?.body ?? '{}')).toEqual({ language: 'en' })
    // The address reads left to right inside an Arabic or English line.
    expect(await tab.getByText('ali@example.com').getAttribute('dir')).toBe('ltr')
    for (const name of ['Sign out', 'Sign out everywhere', 'Delete account…']) {
      expect(
        (await tab.getByRole('button', { name, exact: true }).boundingBox())?.height,
      ).toBeGreaterThanOrEqual(44)
    }
    await tab.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect
      .poll(() => seen.some((call) => call.method === 'DELETE' && call.path === '/api/session'))
      .toBe(true)
    await close()
  })

  it('says what the plan allows, from the API’s own numbers', async () => {
    const { tab, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      sites: [SAVED],
      limit: 3,
      monitoring: { limit: 1, everyDays: 7 },
    })
    await tab.goto(base.url('/en/app/account'))
    const plan = tab.getByRole('heading', { name: 'Your plan' })
    await plan.waitFor({ timeout: 15_000 })
    const rows = await tab.locator('section[aria-labelledby="ac-plan"] dl > div').allTextContents()
    expect(rows[0]).toContain('Saved sites')
    expect(rows[0]).toContain('3')
    expect(rows[1]).toContain('Monitored sites')
    expect(rows[1]).toContain('1')
    expect(rows[2]).toContain('Every 7 days')
    expect(rows[3]).toContain('50 pages')
    expect(rows[6]).toContain('30 days')
    await close()
  })

  it('erases the account after one confirmation, and says it is gone', async () => {
    const { tab, seen, base, close } = await open(site, { account: ACCOUNT, google: true })
    await tab.goto(base.url('/app/account'))
    await tab.getByRole('button', { name: 'حذف الحساب…' }).click()
    expect(seen.filter((call) => call.method === 'DELETE')).toHaveLength(0)
    await tab.getByRole('button', { name: 'احذف حسابي نهائياً' }).click()
    await tab.getByText('حُذف حسابك.').waitFor()
    const deletes = seen.filter((call) => call.method === 'DELETE' && call.path === '/api/account')
    expect(deletes).toHaveLength(1)
    expect(JSON.parse(deletes[0]?.body ?? '{}')).toEqual({ confirm: true })
    await close()
  })

  it('asks for a fresh sign-in when the API says the session is too old', async () => {
    const { tab, seen, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      deleteStatus: 403,
      deleteBody: { error: 'fresh-login-required' },
    })
    await tab.goto(base.url('/en/app/account'))
    await tab.getByRole('button', { name: 'Delete account…' }).click()
    await tab.getByRole('button', { name: 'Delete my account for good' }).click()
    await tab.getByText('sign in again before deleting').waitFor()
    await Promise.all([
      tab.waitForURL('https://accounts.google.com/**'),
      tab.getByRole('button', { name: 'Sign in again' }).click(),
    ])
    expect(seen.some((call) => call.path === '/api/session/google')).toBe(true)
    await close()
  })
})

describe('saved sites and the history, in Chromium', () => {
  it('lists the sites with their last score, and the scans with report links', async () => {
    const { tab, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      sites: [SAVED],
      scans: [LAST],
    })
    await tab.goto(base.url('/en/app/sites'))
    await tab.getByRole('heading', { name: 'My sites', level: 1 }).waitFor({ timeout: 15_000 })
    await tab.getByText('1 of 3 saved').waitFor()
    await tab.locator('main td[data-cell="score"]').getByText('82').waitFor()
    // Targets are 44 px; the page draws no style attribute (the CSP forbids them).
    for (const name of ['Scan now', 'Save site']) {
      expect(
        (await tab.getByRole('button', { name, exact: true }).boundingBox())?.height,
      ).toBeGreaterThanOrEqual(44)
    }
    expect(await tab.locator('main [style]').count()).toBe(0)
    await tab.goto(base.url('/en/app/scans'))
    await tab.getByText('We keep your scans for 30 days, then delete them.').waitFor()
    expect(
      await tab.locator('main a[href="/en/r/BBBBBBBBBBBBBBBBBBBBBB"]').count(),
    ).toBeGreaterThanOrEqual(1)
    await close()
  })

  it('says the same in Arabic, right to left, with the address left to right', async () => {
    const { tab, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      sites: [SAVED],
      scans: [LAST],
    })
    await tab.goto(base.url('/app/sites'))
    await tab.getByRole('heading', { name: 'مواقعي', level: 1 }).waitFor({ timeout: 15_000 })
    await tab.getByText('المحفوظ 1 من أصل 3').waitFor()
    await tab.locator('main td[data-cell="score"]').getByText('82').waitFor()
    const host = tab.locator('main td[data-cell="site"] a').first()
    expect(await host.textContent()).toBe('example.com')
    expect(await host.getAttribute('dir')).toBe('ltr')
    expect(await tab.evaluate(() => document.documentElement.dir)).toBe('rtl')
    await close()
  })

  it('saves a site, removes one after asking, and scans one into its report', async () => {
    const { tab, seen, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      sites: [SAVED],
      scans: [LAST],
    })
    await tab.goto(base.url('/en/app/sites'))
    await tab.getByLabel('Site URL').fill('new.example.org')
    await tab.getByRole('button', { name: 'Save site' }).click()
    await tab.getByText('2 of 3 saved').waitFor()
    await tab.getByText('new.example.org').first().waitFor()
    const added = seen.find((call) => call.method === 'POST' && call.path === '/api/sites')
    expect(JSON.parse(added?.body ?? '{}')).toEqual({ url: 'https://new.example.org/' })
    await tab.getByRole('button', { name: 'Remove example.com from your sites' }).click()
    // Nothing is sent before the person says yes.
    expect(
      seen.some((call) => call.method === 'DELETE' && call.path.startsWith('/api/sites/')),
    ).toBe(false)
    await tab.getByRole('button', { name: 'Remove the site' }).click()
    await tab.getByText('1 of 3 saved').waitFor()
    expect(
      seen.some((call) => call.method === 'DELETE' && call.path === `/api/sites/${SITE_ID}`),
    ).toBe(true)
    await Promise.all([
      tab.waitForURL('**/en/r/SSSSSSSSSSSSSSSSSSSSSS'),
      tab.getByRole('button', { name: 'Scan now' }).click(),
    ])
    const scans = seen.filter((call) => call.method === 'POST' && call.path.endsWith('/scans'))
    expect(scans).toHaveLength(1)
    // No Turnstile token is asked of a signed-in person.
    expect(scans[0]?.body).toBeNull()
    await close()
  })

  it('says why a site was not saved: the plan’s limit, and an address that is not one', async () => {
    const { tab, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      sites: [SAVED],
      addStatus: 403,
      addBody: { error: 'plan-limit', limit: 'savedSites', plan: 'account' },
    })
    await tab.goto(base.url('/en/app/sites'))
    await tab.getByLabel('Site URL').fill('other.example.org')
    await tab.getByRole('button', { name: 'Save site' }).click()
    await tab.getByText('You have reached the number of saved sites your plan allows').waitFor()
    await tab.getByLabel('Site URL').fill('http://')
    await tab.getByRole('button', { name: 'Save site' }).click()
    await tab.getByText('That is not a full URL').waitFor()
    await close()
  })

  it('filters and pages the scans, ten at a time', async () => {
    const many = Array.from({ length: 13 }, (_, i) => ({
      ...LAST,
      id: String(i).padStart(2, '0').repeat(11),
      url: i % 2 === 0 ? 'https://even.example/' : 'https://odd.example/',
      state: i === 4 ? 'failed' : 'complete',
      score: i === 4 ? null : 60 + i,
      siteId: null,
      createdAt: `2026-10-${String(20 - i).padStart(2, '0')}T12:00:00.000Z`,
    }))
    const { tab, base, close } = await open(site, { account: ACCOUNT, google: true, scans: many })
    await tab.goto(base.url('/en/app/scans'))
    await tab.getByText('1 to 10 of 13').waitFor({ timeout: 15_000 })
    expect(await tab.locator('main tbody tr').count()).toBe(10)
    await tab.getByRole('button', { name: 'Next' }).click()
    await tab.getByText('11 to 13 of 13').waitFor()
    expect(await tab.getByRole('button', { name: 'Next' }).isDisabled()).toBe(true)
    await tab.getByLabel('Search by address').fill('odd.example')
    await tab.getByText('1 to 6 of 6').waitFor()
    await tab.getByLabel('State').selectOption('failed')
    await tab.getByText('No scans match this filter.').waitFor()
    await tab.getByRole('button', { name: 'Clear the filter' }).click()
    await tab.getByText('1 to 10 of 13').waitFor()
    await close()
  })
})

const point = (n: number, overall: number | null, speed: number | null, source = 'manual') => ({
  scanId: String(n).repeat(22),
  at: `2026-10-0${String(n)}T12:00:00.000Z`,
  source,
  state: overall === null ? 'failed' : 'complete',
  overall,
  categories: speed === null ? {} : { speed, rtl: 90 },
})
const HISTORY = {
  siteId: SITE_ID,
  url: 'https://example.com/',
  days: 30,
  since: '2026-09-09T12:00:00.000Z',
  alerts: true,
  points: [point(1, 90, 80), point(3, 72, 55, 'monitor'), point(5, null, null, 'monitor')],
  markers: [
    {
      scanId: '3'.repeat(22),
      at: '2026-10-03T12:00:00.000Z',
      kind: 'score-drop',
      from: 90,
      to: 72,
    },
    { scanId: '5'.repeat(22), at: '2026-10-05T12:00:00.000Z', kind: 'down' },
  ],
}
const OLDER = {
  ...LAST,
  id: 'EEEEEEEEEEEEEEEEEEEEEE',
  score: 70,
  createdAt: '2026-10-01T12:00:00.000Z',
}
const COMPARISON = {
  base: {
    id: OLDER.id,
    url: 'https://example.com/',
    createdAt: OLDER.createdAt,
    state: 'complete',
    rulesetVersion: '1.0.0',
    rules: { ran: 40, total: 40 },
  },
  head: {
    id: LAST.id,
    url: 'https://example.com/',
    createdAt: SOON,
    state: 'complete',
    rulesetVersion: '1.0.0',
    rules: { ran: 40, total: 40 },
  },
  overall: { before: 70, after: 82, change: 12 },
  categories: [{ category: 'speed', before: 60, after: 75, change: 15 }],
  engines: [
    {
      engine: 'chromium',
      before: 'rendered',
      after: 'rendered',
      findingsBefore: 2,
      findingsAfter: 1,
    },
  ],
  sameRules: true,
  counts: { new: 1, fixed: 1, worsened: 0, improved: 0, unchanged: 1 },
  changes: [
    {
      kind: 'new',
      ruleId: 'img-alt',
      severity: 'serious',
      before: null,
      after: 'serious',
      locator: 'main > img.hero',
      message: { ar: 'صورة بلا نص بديل', en: 'Image without alt text' },
      engines: ['chromium'],
    },
    {
      kind: 'fixed',
      ruleId: 'title-length',
      severity: 'minor',
      before: 'minor',
      after: null,
      locator: null,
      message: { ar: 'عنوان طويل', en: 'Title too long' },
      engines: [],
    },
    {
      kind: 'unchanged',
      ruleId: 'h1-missing',
      severity: 'moderate',
      before: 'moderate',
      after: 'moderate',
      locator: null,
      message: { ar: 'لا H1', en: 'No H1' },
      engines: [],
    },
  ],
  omitted: 0,
}

describe('score history and comparison, in Chromium', () => {
  it('draws a site’s scores with its alert marks and the same numbers as a table, in both directions', async () => {
    for (const [path, label] of [
      [`/en/app/site?id=${SITE_ID}`, 'Chart of the scores of https://example.com/ over time'],
      [`/app/site?id=${SITE_ID}`, 'مخطط درجات https://example.com/ عبر الزمن'],
    ] as const) {
      const { tab, base, close } = await open(site, {
        account: ACCOUNT,
        google: true,
        sites: [SAVED],
        scans: [LAST],
        history: HISTORY,
      })
      await tab.goto(base.url(path))
      await tab.getByRole('img', { name: label }).waitFor({ timeout: 15_000 })
      // The overall line, one dot per scored scan, and a mark per alert.
      expect(await tab.locator('main svg.app-chart circle').count()).toBe(2)
      expect(await tab.locator('main svg.app-chart g[aria-hidden] > path').count()).toBe(2)
      // The oldest scan sits at the start edge: left in English, right in Arabic.
      const xs = await tab
        .locator('main svg.app-chart circle')
        .evaluateAll((all) => all.map((c) => Number(c.getAttribute('cx'))))
      expect((xs[0] ?? 0) < (xs[1] ?? 0)).toBe(path.startsWith('/en/'))
      // A category line is switched on from a chip that says whether it is pressed.
      const chip = tab.locator('main button.chip[aria-pressed]').first()
      expect(await chip.getAttribute('aria-pressed')).toBe('false')
      expect((await chip.boundingBox())?.height).toBeGreaterThanOrEqual(44)
      await chip.click()
      expect(await chip.getAttribute('aria-pressed')).toBe('true')
      expect(await tab.locator('main svg.app-chart circle').count()).toBe(4)
      // The table holds every value; nothing overflows the phone, and no style attribute is drawn.
      await tab.locator('main button[aria-controls$="-table"]').click()
      expect(await tab.locator('main table tbody tr').count()).toBe(3)
      expect(
        await tab.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        path,
      ).toBe(true)
      expect(await tab.locator('main [style]').count()).toBe(0)
      await close()
    }
  })

  it('follows the pointer and the arrow keys along the chart, and says the scan under it', async () => {
    const { tab, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      sites: [SAVED],
      scans: [LAST],
      history: HISTORY,
    })
    await tab.goto(base.url(`/en/app/site?id=${SITE_ID}`))
    const chart = tab.locator('main svg.app-chart')
    await chart.waitFor({ timeout: 15_000 })
    const cursor = chart.locator('g[pointer-events="none"]')
    expect(await cursor.count()).toBe(0)
    // The pointer at the chart's left end finds the oldest scored scan; its readout is said, politely.
    const box = await chart.boundingBox()
    await tab.mouse.move((box?.x ?? 0) + 40, (box?.y ?? 0) + 60)
    await cursor.waitFor()
    expect(await cursor.locator('text').first().textContent()).toBe('Oct 1')
    expect(await cursor.locator('text').nth(1).textContent()).toBe('90')
    await tab.mouse.move(0, 0)
    await cursor.waitFor({ state: 'detached' })
    // From the keyboard: focus lands on the newest scan, the arrows move one scan, Escape lets go.
    await chart.focus()
    await cursor.waitFor()
    expect(await cursor.locator('text').nth(1).textContent()).toBe('72')
    await tab.keyboard.press('ArrowLeft')
    expect(await cursor.locator('text').nth(1).textContent()).toBe('90')
    expect(
      await chart.locator('xpath=..').locator('p[aria-live="polite"]').textContent(),
    ).toContain('90')
    await tab.keyboard.press('Escape')
    await cursor.waitFor({ state: 'detached' })
    await close()
  })

  it('offers «compare with the previous scan» beside a scan that has an older one, and shows the comparison', async () => {
    const { tab, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      sites: [SAVED],
      scans: [LAST, OLDER],
      compare: { status: 200, body: COMPARISON },
    })
    await tab.goto(base.url('/en/app/scans'))
    const link = tab.getByRole('link', { name: /Compare with the scan of/ })
    await link.waitFor({ timeout: 15_000 })
    expect(await link.count()).toBe(1)
    expect(await link.getAttribute('href')).toBe(
      `/en/account/compare?type=scan&base=${OLDER.id}&head=${LAST.id}`,
    )
    // The site's page offers the same, for its last two.
    await tab.goto(base.url(`/en/app/site?id=${SITE_ID}`))
    const last = tab.getByRole('link', { name: /Compare with the scan of/ })
    await last.waitFor()
    expect(await last.getAttribute('href')).toBe(
      `/en/account/compare?type=scan&base=${OLDER.id}&head=${LAST.id}`,
    )
    await last.click()
    await tab.getByRole('heading', { name: 'Compare two reports' }).waitFor()
    await tab.getByText('Image without alt text').waitFor()
    await tab.getByText('Title too long').waitFor()
    await tab.getByText('+12').first().waitFor()
    // The unchanged stay folded until asked.
    expect(await tab.getByText('No H1').count()).toBe(0)
    await tab.getByRole('button', { name: /Show the unchanged/ }).click()
    await tab.getByText('No H1').waitFor()
    expect(
      await tab.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    expect(await tab.locator('main [style]').count()).toBe(0)
    await close()
  })

  it('says plainly when two reports cannot be compared, and for a link that is not two ids', async () => {
    const refused = await open(site, {
      account: ACCOUNT,
      google: true,
      compare: { status: 422, body: { error: 'not-comparable' } },
    })
    await refused.tab.goto(
      refused.base.url(`/account/compare?type=scan&base=${OLDER.id}&head=${LAST.id}`),
    )
    await refused.tab.getByText('لا نستطيع مقارنة هذين التقريرين').waitFor({ timeout: 15_000 })
    await refused.close()
    const bad = await open(site, { account: ACCOUNT, google: true })
    await bad.tab.goto(bad.base.url('/en/account/compare?type=scan&base=a&head=b'))
    await bad.tab.getByText('The comparison failed').waitFor({ timeout: 15_000 })
    expect(bad.seen.filter((call) => call.path.startsWith('/api/compare/'))).toHaveLength(0)
    await bad.close()
  })
})

describe('monitoring and alerts, in Chromium', () => {
  it('turns monitoring on for a site, with the next scan and the last scores, and off again', async () => {
    const { tab, seen, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      sites: [SAVED],
    })
    await tab.goto(base.url(`/en/app/site?id=${SITE_ID}`))
    await tab.getByText('Not monitored').waitFor({ timeout: 15_000 })
    const on = tab.getByRole('button', { name: 'Monitor this site' })
    expect((await on.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    await on.click()
    await tab.getByText('Scanned automatically every 7 days').waitFor()
    await tab.getByText('Next scan:').waitFor()
    await tab.getByRole('img', { name: 'Latest scores, oldest first: 90, 82' }).waitFor()
    const put = seen.find((call) => call.method === 'PUT' && call.path.endsWith('/monitor'))
    expect(JSON.parse(put?.body ?? '{}')).toEqual({ enabled: true })
    expect(await tab.locator('main [style]').count()).toBe(0)
    await tab.getByRole('button', { name: 'Stop monitoring' }).click()
    await tab.getByText('Not monitored').waitFor()
    await close()
  })

  it('lists what is monitored, with its schedule and state, and counts it against the plan', async () => {
    const { tab, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      sites: [{ ...SAVED, monitor: MONITOR }],
      monitoring: { limit: 2, everyDays: 7 },
      history: { ...HISTORY, markers: [HISTORY.markers[0]] },
    })
    await tab.goto(base.url('/en/app/monitoring'))
    await tab.getByText('1 of 2 monitoring slots').waitFor({ timeout: 15_000 })
    const row = tab.locator('main tbody tr').first()
    expect(await row.textContent()).toContain('Every 7 days')
    expect(await row.textContent()).toContain('Running')
    // The alert the monitor would have sent, worked out from the history.
    await tab.getByText('Score dropped from 90 to 72').waitFor()
    await close()
  })

  it('says why a second site cannot be monitored at the plan’s one', async () => {
    const { tab, seen, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      sites: [
        { ...SAVED, monitor: MONITOR },
        { ...SAVED, id: 'EEEEEEEEEEEEEEEEEEEEEE', url: 'https://other.example/', monitor: null },
      ],
    })
    await tab.goto(base.url('/en/app/site?id=EEEEEEEEEEEEEEEEEEEEEE'))
    await tab.getByRole('button', { name: 'Monitor this site' }).click()
    await tab.getByText('Your plan monitors 1 site.').waitFor()
    expect(seen.some((call) => call.method === 'PUT' && call.path.endsWith('/monitor'))).toBe(false)
    await close()
  })

  it('saves a webhook, shows its secret once, and sends a test', async () => {
    const { tab, seen, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      sites: [SAVED],
    })
    await tab.goto(base.url('/en/app/monitoring'))
    await tab.getByRole('heading', { name: 'Alerts', exact: true }).waitFor({ timeout: 15_000 })
    await tab.getByLabel('Webhook address').fill('https://hooks.slack.com/services/T0/B0/xyz')
    await tab.getByRole('button', { name: 'Save alerts' }).click()
    await tab.getByText('Sending to hooks.slack.com (Slack)').waitFor()
    await tab.getByText('S'.repeat(43)).waitFor()
    const saved = seen.find((call) => call.method === 'PUT' && call.path === '/api/account/alerts')
    expect(JSON.parse(saved?.body ?? '{}')).toEqual({
      webhookUrl: 'https://hooks.slack.com/services/T0/B0/xyz',
      dropThreshold: 10,
      onCritical: true,
      onDown: true,
      weeklySummary: false,
    })
    // The address is not kept in the page: the field is empty again.
    expect(await tab.getByLabel('Webhook address').inputValue()).toBe('')
    await tab.getByRole('button', { name: 'I copied it' }).click()
    expect(await tab.getByText('S'.repeat(43)).count()).toBe(0)
    await tab.getByRole('button', { name: 'Send a test' }).click()
    await tab.getByText('Test sent. Check your channel.').waitFor()
    for (const name of ['Save alerts', 'Send a test']) {
      expect(
        (await tab.getByRole('button', { name, exact: true }).boundingBox())?.height,
      ).toBeGreaterThanOrEqual(44)
    }
    expect(await tab.locator('main [style]').count()).toBe(0)
    await close()
  })

  it('says the same in Arabic, right to left', async () => {
    const { tab, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      sites: [{ ...SAVED, monitor: MONITOR }],
      alerts: HOOK_ALERTS,
    })
    await tab.goto(base.url('/app/monitoring'))
    await tab.getByRole('heading', { name: 'التنبيهات', exact: true }).waitFor({ timeout: 15_000 })
    await tab.getByText('كل 7 أيام').first().waitFor()
    await tab.getByText('نرسل إلى hooks.slack.com (Slack)').waitFor()
    await close()
  })
})

describe('PDF export and white-label, in Chromium', () => {
  it('saves a company name, colour and logo, warns of a colour too faint for white text, and previews the mark', async () => {
    const { tab, seen, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      brand: { available: true, name: '', color: null, hasLogo: false },
    })
    await tab.goto(base.url('/en/app/brand'))
    const form = tab.getByRole('region', { name: 'Your brand on reports' })
    await form.waitFor({ timeout: 15_000 })
    const name = form.getByLabel('Company name')
    await name.fill('Noor Marketing')
    // A faint colour: the form says Arablyzer's colour is used instead.
    await form.getByLabel('Brand colour').fill('#ffff00')
    await form.getByText(/too faint on this colour/).waitFor()
    await form.getByLabel('Brand colour').fill('#0b3d2e')
    expect(await form.getByText(/too faint on this colour/).count()).toBe(0)
    // The logo goes up as its own bytes, and a file that is not a picture is turned down.
    await form
      .locator('input[type=file]')
      .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(PNG_BYTES) })
    await form.getByText('Your brand is saved.').waitFor()
    await form.getByRole('img', { name: /logo/ }).first().waitFor()
    await form.locator('input[type=file]').setInputFiles({
      name: 'logo.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    })
    await form.getByText('Only PNG, JPEG and WebP are accepted.').waitFor()
    await form.getByRole('button', { name: 'Save' }).click()
    await form.getByText('Your brand is saved.').waitFor()
    const put = seen.filter((call) => call.method === 'PUT' && call.path === '/api/account/brand')
    expect(JSON.parse(put.at(-1)?.body ?? '{}')).toEqual({
      name: 'Noor Marketing',
      color: '#0b3d2e',
    })
    // The preview wears the colour through the style object (the page's policy allows no style attribute in markup).
    const preview = form.locator('div.bg-\\(--brand\\)')
    expect(await preview.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      'rgb(11, 61, 46)',
    )
    expect(await preview.textContent()).toContain('Noor Marketing')
    for (const control of await form.locator('button').all()) {
      expect((await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43)
    }
    expect(
      await tab.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await close()
  })

  it('says a plan without white-label has none, and shows no form', async () => {
    const { tab, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      brand: { available: false, name: '', color: null, hasLogo: false },
    })
    await tab.goto(base.url('/en/app/brand'))
    await tab
      .getByText('Your own brand is not included in your current plan.')
      .waitFor({ timeout: 15_000 })
    expect(await tab.getByLabel('Company name').count()).toBe(0)
    await close()
  })

  it('asks for the PDF of a scan, waits for it, and offers the file', async () => {
    const { tab, seen, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      sites: [SAVED],
      scans: [LAST],
      pdf: { status: 202, body: PDF_JOB },
    })
    await tab.goto(base.url('/en/app/scans'))
    const button = tab
      .getByRole('button', { name: /Download example.com\/ as a PDF|Download .* as a PDF/ })
      .first()
    await button.waitFor({ timeout: 15_000 })
    expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43)
    await button.click()
    const link = tab.getByRole('link', { name: 'Download the file' })
    await link.waitFor({ timeout: 15_000 })
    expect(await link.getAttribute('href')).toBe(`/api/pdf/${PDF_JOB.id}/file`)
    const asked = seen.filter((call) => call.method === 'POST' && call.path === '/api/pdf')
    expect(asked).toHaveLength(1)
    expect(JSON.parse(asked[0]?.body ?? '{}')).toEqual({
      kind: 'scan',
      id: LAST.id,
      language: 'en',
    })
    await close()
  })

  it('shows a shared report the company’s mark, and the Download PDF button to a signed-in visitor', async () => {
    const id = 'SharedSharedSharedSh_0'
    const brand = { name: 'Noor Marketing', color: '#0b3d2e', hasLogo: true, credit: true }
    const { tab, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      report: { id, brand },
    })
    await tab.goto(base.url(`/en/r/${id}`))
    const bar = tab.locator('[data-brand-bar]')
    await bar.waitFor({ timeout: 15_000 })
    expect(await bar.textContent()).toContain('Noor Marketing')
    expect(await bar.textContent()).toContain('by Arablyzer')
    expect(await bar.getByRole('img', { name: 'Noor Marketing logo' }).count()).toBe(1)
    expect(await bar.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(11, 61, 46)')
    await tab.getByRole('button', { name: /as a PDF/ }).waitFor({ timeout: 15_000 })
    await close()
    // A report whose account has no brand shows none; a visitor who is not signed in gets no PDF button.
    const plain = await open(site, { account: null, google: true, report: { id, brand: null } })
    await plain.tab.goto(plain.base.url(`/en/r/${id}`))
    await plain.tab.getByRole('link', { name: 'Scan again' }).waitFor({ timeout: 15_000 })
    expect(await plain.tab.locator('[data-brand-bar]').count()).toBe(0)
    expect(await plain.tab.getByRole('button', { name: /as a PDF/ }).count()).toBe(0)
    await plain.close()
  })

  it('says the month’s limit plainly when the plan’s PDFs are used up', async () => {
    const { tab, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      sites: [SAVED],
      scans: [LAST],
      pdf: { status: 403, body: { error: 'plan-limit', limit: 'pdfPerMonth', plan: 'account' } },
    })
    await tab.goto(base.url('/en/app/scans'))
    await tab
      .getByRole('button', { name: /as a PDF/ })
      .first()
      .click()
    await tab
      .getByText('You have reached your plan’s PDF limit for this month.')
      .waitFor({ timeout: 15_000 })
    await close()
  })
})

const DASH_PAGES = [
  '/app',
  '/app/sites',
  `/app/site?id=${SITE_ID}`,
  '/app/scans',
  '/app/monitoring',
  '/app/crawls',
  '/app/pdfs',
  '/app/keys',
  '/app/brand',
  '/app/account',
]

describe('the dashboard, in Chromium', () => {
  it('draws the shell around the overview, marks the page, and counts against the API’s numbers', async () => {
    const { tab, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      sites: [SAVED],
      scans: [LAST],
      width: 1280,
    })
    await tab.goto(base.url('/en/app'))
    await tab.getByRole('heading', { name: 'Welcome, علي', level: 1 }).waitFor({ timeout: 15_000 })
    const nav = tab.locator('aside nav')
    expect(await nav.locator('a').count()).toBe(9)
    expect(await nav.locator('a[aria-current="page"]').textContent()).toContain('Overview')
    // The limits are the API's: three saved sites and one monitored by default.
    const meters = tab.locator('main [role="meter"]')
    await meters.first().waitFor()
    expect(await meters.nth(0).getAttribute('aria-valuetext')).toBe('1 of 3')
    expect(await meters.nth(1).getAttribute('aria-valuetext')).toBe('0 of 1')
    expect(await tab.locator('main dl.app-stats').textContent()).toContain('82')
    await close()
  })

  it('invites the first site where there is none, and keeps a checklist', async () => {
    const { tab, base, close } = await open(site, { account: ACCOUNT, google: true, width: 1280 })
    await tab.goto(base.url('/en/app'))
    await tab.getByText('Start with your first site').waitFor({ timeout: 15_000 })
    await tab.getByText('0 of 4').waitFor()
    expect(await tab.getByRole('link', { name: 'Add a site' }).count()).toBeGreaterThan(0)
    await close()
  })

  it('runs under the page’s policy: no violation on any page, and no style attribute in the markup the server drew', async () => {
    const { tab, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      sites: [SAVED],
      scans: [LAST],
      history: HISTORY,
      brand: { available: true, name: '', color: null, hasLogo: false },
      width: 1280,
    })
    const violations: string[] = []
    tab.on('console', (message) => {
      if (/Content Security Policy|Refused to/i.test(message.text()))
        violations.push(message.text())
    })
    tab.on('pageerror', (error) => violations.push(error.message))
    for (const page of DASH_PAGES) {
      for (const prefix of ['', '/en']) {
        await tab.goto(base.url(`${prefix}${page}`))
        await tab.locator('main h1').waitFor({ timeout: 15_000 })
        await tab.waitForLoadState('networkidle')
      }
    }
    expect(violations).toEqual([])
    for (const file of ['app.html', 'app/sites.html', 'en/app/site.html']) {
      const html = await readFile(path.join(built, file), 'utf8')
      expect(html, file).not.toMatch(/\sstyle="/)
      expect(html, file).toContain('noindex')
    }
    await close()
  })

  it('opens in the system’s scheme with no flash, and keeps the person’s choice', async () => {
    const { tab, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      scheme: 'dark',
      width: 1280,
    })
    await tab.goto(base.url('/en/app'), { waitUntil: 'domcontentloaded' })
    // Set by the head's own script, before the island has run.
    expect(await tab.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(
      'dark',
    )
    const ground = () => tab.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(await ground()).toBe('rgb(11, 18, 32)')
    await tab.getByRole('button', { name: 'Light mode' }).click()
    expect(await tab.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(
      'light',
    )
    expect(await ground()).toBe('rgb(246, 248, 251)')
    expect(await tab.evaluate(() => localStorage.getItem('arablyzer-theme'))).toBe('light')
    await tab.reload({ waitUntil: 'domcontentloaded' })
    expect(await tab.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(
      'light',
    )
    await close()
  })

  it('searches the person’s own sites and scans from the keyboard', async () => {
    const { tab, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      sites: [SAVED],
      scans: [LAST],
      width: 1280,
    })
    await tab.goto(base.url('/en/app/scans'))
    await tab.locator('main h1').waitFor({ timeout: 15_000 })
    await tab.keyboard.press('Control+K')
    const dialog = tab.getByRole('dialog', { name: 'Go to' })
    await dialog.waitFor()
    await dialog.getByRole('combobox').fill('example')
    expect(await dialog.getByRole('option').count()).toBe(2)
    await tab.keyboard.press('Enter')
    await tab.waitForURL(`**/en/app/site?id=${SITE_ID}`)
    await tab.locator('main h1').waitFor()
    await tab.keyboard.press('Control+K')
    await dialog.waitFor()
    await dialog.getByRole('combobox').fill('zzz')
    await dialog.getByText('No results for “zzz”.').waitFor()
    await tab.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    await close()
  })

  it('has a bottom bar and a sheet on a phone, and nothing sideways on any page', async () => {
    const { tab, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      sites: [SAVED],
      scans: [LAST],
      history: HISTORY,
      brand: { available: true, name: '', color: null, hasLogo: false },
    })
    await tab.goto(base.url('/en/app'))
    await tab.locator('main h1').waitFor({ timeout: 15_000 })
    expect(await tab.locator('aside').isVisible()).toBe(false)
    const bar = tab.getByRole('navigation', { name: 'Navigation' })
    expect(await bar.isVisible()).toBe(true)
    for (const link of await bar.getByRole('link').all()) {
      expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
    }
    await bar.getByRole('button', { name: 'More' }).click()
    const sheet = tab.getByRole('dialog', { name: 'More' })
    await sheet.waitFor()
    expect(await sheet.getByRole('link').count()).toBe(9)
    await tab.keyboard.press('Escape')
    await sheet.waitFor({ state: 'hidden' })
    for (const page of DASH_PAGES) {
      await tab.goto(base.url(`/en${page}`))
      await tab.locator('main h1').waitFor({ timeout: 15_000 })
      await tab.waitForLoadState('networkidle')
      expect(
        await tab.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
        page,
      ).toBeLessThanOrEqual(0)
    }
    await close()
  })

  it('folds the menu to icons on a tablet, and on a desktop when asked, and remembers it', async () => {
    const tablet = await open(site, { account: ACCOUNT, google: true, width: 900 })
    await tablet.tab.goto(tablet.base.url('/en/app'))
    await tablet.tab.locator('main h1').waitFor({ timeout: 15_000 })
    const aside = tablet.tab.locator('aside')
    expect((await aside.boundingBox())?.width).toBeLessThan(100)
    // The names stay for a screen reader.
    expect(await aside.getByRole('link', { name: 'My sites' }).count()).toBe(1)
    await tablet.close()
    const wide = await open(site, { account: ACCOUNT, google: true, width: 1280 })
    await wide.tab.goto(wide.base.url('/en/app'))
    await wide.tab.locator('main h1').waitFor({ timeout: 15_000 })
    expect((await wide.tab.locator('aside').boundingBox())?.width).toBeGreaterThan(250)
    await wide.tab.getByRole('button', { name: 'Collapse the menu' }).click()
    expect((await wide.tab.locator('aside').boundingBox())?.width).toBeLessThan(100)
    await wide.tab.reload()
    await wide.tab.getByRole('button', { name: 'Expand the menu' }).waitFor({ timeout: 15_000 })
    await wide.close()
  })

  it('sends a visitor who is not signed in to the sign-in page', async () => {
    const { tab, base, close } = await open(site, { account: null, google: true })
    await tab.goto(base.url('/en/app/sites'))
    await tab.waitForURL('**/en/login')
    await close()
  })

  it('has the account menu with the language and the ways out', async () => {
    const { tab, seen, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      width: 1280,
    })
    await tab.goto(base.url('/en/app'))
    await tab.locator('main h1').waitFor({ timeout: 15_000 })
    await tab.getByRole('button', { name: 'Account menu' }).click()
    await tab.getByText('ali@example.com').waitFor()
    await tab.getByRole('link', { name: /Language/ }).click()
    await tab.waitForURL((url) => url.pathname === '/app')
    expect(JSON.parse(seen.find((call) => call.method === 'PATCH')?.body ?? '{}')).toEqual({
      language: 'ar',
    })
    await tab.locator('main h1').waitFor()
    await tab.getByRole('button', { name: 'قائمة الحساب' }).click()
    await tab.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click()
    await expect
      .poll(() => seen.some((call) => call.method === 'DELETE' && call.path === '/api/session'))
      .toBe(true)
    await close()
  })

  it('is not there on a site built without accounts: its addresses are 404', async () => {
    const { tab, seen, base, close } = await open(plain, { account: null, google: true })
    for (const page of ['/app', '/en/app', '/app/sites', '/en/app/site']) {
      const response = await tab.goto(base.url(page))
      expect(response?.status(), page).toBe(404)
    }
    expect(seen).toEqual([])
    await close()
  })
})

describe('the rest of the site', () => {
  it('loads no account script and asks Google and the API for nothing', async () => {
    for (const page of ['/', '/en/', '/tools/rtl-check', '/tools']) {
      const { tab, seen, external, base, close } = await open(site, { account: null, google: true })
      const scripts: string[] = []
      tab.on('request', (request) => {
        if (request.resourceType() === 'script') scripts.push(request.url())
      })
      await tab.goto(base.url(page))
      await tab.waitForLoadState('networkidle')
      expect(
        scripts.filter((url) => /AccountApp|GoogleSignIn|gis/i.test(url)),
        page,
      ).toEqual([])
      expect(
        external.filter((p) => p.startsWith('/gsi')),
        page,
      ).toEqual([])
      expect(
        seen.filter((call) => call.path === '/api/account'),
        page,
      ).toEqual([])
      await close()
    }
  })

  it('has no account link and says accounts are off on a site built without them', async () => {
    const { tab, seen, base, close } = await open(plain, { account: null, google: true })
    await tab.goto(base.url('/en/login'))
    await tab.getByText('Accounts are not turned on on this site').waitFor({ timeout: 15_000 })
    expect(
      await tab.locator('header a[href="/account"], header a[href="/en/account"]').count(),
    ).toBe(0)
    expect(seen).toEqual([])
    await close()
  })
})

declare global {
  interface Window {
    __gis?: unknown
  }
}

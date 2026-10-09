import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
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
const CLIENT_ID = 'browser-test.apps.googleusercontent.com'
const run = promisify(execFile)

vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 })

const json = (value: unknown, status = 200) => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(value),
})
const SOON = '2026-10-09T12:00:00.000Z'
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
  /** What adding a site answers, in place of a created site. */
  addStatus?: number
  addBody?: unknown
}

/** A context whose requests to the site's API and to Google are answered by the scenario. */
async function open(base: FixtureSite, scenario: Scenario) {
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
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
    await tab.waitForURL('**/account')
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

  it('sends a signed-in visitor on to their account page', async () => {
    const { tab, base, close } = await open(site, { account: ACCOUNT, google: true })
    await tab.goto(base.url('/login'))
    await tab.waitForURL('**/account')
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

describe('the account page, in Chromium', () => {
  it('shows the account, sets the language of an account that has none, and signs out', async () => {
    const { tab, seen, base, close } = await open(site, {
      account: { ...ACCOUNT, language: null as never },
      google: true,
    })
    await tab.goto(base.url('/en/account'))
    await tab.getByText('ali@example.com').waitFor({ timeout: 15_000 })
    await tab.waitForFunction(() => document.querySelector('[aria-pressed="true"]') !== null)
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
    await tab.getByText('You are signed out.').waitFor()
    expect(seen.some((call) => call.method === 'DELETE' && call.path === '/api/session')).toBe(true)
    await close()
  })

  it('erases the account after one confirmation, and says it is gone', async () => {
    const { tab, seen, base, close } = await open(site, { account: ACCOUNT, google: true })
    await tab.goto(base.url('/account'))
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
    await tab.goto(base.url('/en/account'))
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
  it('lists the sites with their last score and the history with report links', async () => {
    const { tab, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      sites: [SAVED],
      scans: [LAST],
    })
    await tab.goto(base.url('/en/account'))
    await tab.getByRole('heading', { name: 'Your sites' }).waitFor({ timeout: 15_000 })
    await tab.getByText('1 of 3 saved').waitFor()
    await tab.getByText('Score 82').first().waitFor()
    await tab.getByText('We keep your scans for 30 days, then delete them.').waitFor()
    const reports = await tab.locator('a[href="/en/r/BBBBBBBBBBBBBBBBBBBBBB"]').count()
    expect(reports).toBeGreaterThanOrEqual(2)
    // Targets are 44 px; the page draws no style attribute (the CSP forbids them).
    for (const name of ['Scan now', 'Save site']) {
      expect(
        (await tab.getByRole('button', { name, exact: true }).boundingBox())?.height,
      ).toBeGreaterThanOrEqual(44)
    }
    expect(await tab.locator('main [style]').count()).toBe(0)
    await close()
  })

  it('says the same in Arabic, right to left, with the address left to right', async () => {
    const { tab, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      sites: [SAVED],
      scans: [LAST],
    })
    await tab.goto(base.url('/account'))
    await tab.getByRole('heading', { name: 'مواقعك' }).waitFor({ timeout: 15_000 })
    await tab.getByText('المحفوظ 1 من أصل 3').waitFor()
    await tab.getByText('الدرجة 82').first().waitFor()
    expect(await tab.locator('bdi[dir="ltr"]').first().textContent()).toBe('example.com')
    await close()
  })

  it('saves a site, removes one, and scans one into its report', async () => {
    const { tab, seen, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      sites: [SAVED],
      scans: [LAST],
    })
    await tab.goto(base.url('/en/account'))
    await tab.getByLabel('Site URL').fill('new.example.org')
    await tab.getByRole('button', { name: 'Save site' }).click()
    await tab.getByText('2 of 3 saved').waitFor()
    await tab.getByText('new.example.org').waitFor()
    const added = seen.find((call) => call.method === 'POST' && call.path === '/api/sites')
    expect(JSON.parse(added?.body ?? '{}')).toEqual({ url: 'https://new.example.org/' })
    await tab.getByRole('button', { name: 'Remove example.com from your sites' }).click()
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
    await tab.goto(base.url('/en/account'))
    await tab.getByLabel('Site URL').fill('other.example.org')
    await tab.getByRole('button', { name: 'Save site' }).click()
    await tab.getByText('You have reached the number of saved sites your plan allows').waitFor()
    await tab.getByLabel('Site URL').fill('http://')
    await tab.getByRole('button', { name: 'Save site' }).click()
    await tab.getByText('That is not a full URL').waitFor()
    await close()
  })
})

describe('monitoring and alerts, in Chromium', () => {
  it('turns monitoring on for a site, with the next scan and the last scores, and off again', async () => {
    const { tab, seen, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      sites: [SAVED],
    })
    await tab.goto(base.url('/en/account'))
    await tab.getByText('Not monitored').waitFor({ timeout: 15_000 })
    await tab.getByText('0 of 1 monitored').waitFor()
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

  it('says why a second site cannot be monitored at the plan’s one', async () => {
    const { tab, seen, base, close } = await open(site, {
      account: ACCOUNT,
      google: true,
      sites: [
        { ...SAVED, monitor: MONITOR },
        { ...SAVED, id: 'EEEEEEEEEEEEEEEEEEEEEE', url: 'https://other.example/', monitor: null },
      ],
    })
    await tab.goto(base.url('/en/account'))
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
    await tab.goto(base.url('/en/account'))
    await tab.getByRole('heading', { name: 'Alerts' }).waitFor({ timeout: 15_000 })
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
    await tab.goto(base.url('/account'))
    await tab.getByRole('heading', { name: 'التنبيهات' }).waitFor({ timeout: 15_000 })
    await tab.getByText('نفحصه تلقائياً كل 7 أيام').waitFor()
    await tab.getByText('نرسل إلى hooks.slack.com (Slack)').waitFor()
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

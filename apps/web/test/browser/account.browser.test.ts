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

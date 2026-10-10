import type { BrandSettings, PdfsResponse, PdfSummary } from '@arablyzer/api-contract'
import { DEFAULT_POLICY } from '@arablyzer/egress'
import { DEVELOPMENT_LIMITS, planCatalogFrom } from '@arablyzer/plans'
import {
  MemoryAccountData,
  MemoryCrawlData,
  MemoryInFlight,
  MemoryMonitorData,
  MemoryPdfData,
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  MemoryScanStore,
} from '@arablyzer/store'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AccountsDeps } from '../src/accounts'
import { createApp } from '../src/app'
import { createAuth } from '../src/auth'
import { DEFAULT_CRAWL_SETTINGS } from '../src/crawl/settings'
import { CLIENT_ID, CLIENT_SECRET, idToken, stubGoogle } from './support/google'
import { reportOf } from './support/reports'

// M4.6: the comparison and history routes: whose reports they read, which pairs they refuse, and
// what a site's history holds.

const SITE = new URL('https://arablyzer.example')
const PLAN = {
  ARABLYZER_PLAN_ACCOUNT_SCANS: '3',
  ARABLYZER_PLAN_ACCOUNT_SCAN_SECONDS: '60',
  ARABLYZER_PLAN_ACCOUNT_INFLIGHT: '2',
  ARABLYZER_PLAN_ACCOUNT_SAVED_SITES: '3',
  ARABLYZER_PLAN_ACCOUNT_HISTORY_DAYS: '30',
  ARABLYZER_PLAN_ACCOUNT_CRAWL_PAGES: '20',
}
const ANONYMOUS = { ...DEVELOPMENT_LIMITS, perConnection: { scans: 1, seconds: 60 }, inFlight: 1 }
const NOW = new Date('2026-10-09T12:00:00.000Z')
const SHOP = 'https://shop.example/'
const id = (name: string) => name.padEnd(22, '_')

import { jpeg, png, svg } from '../../../packages/pdf/test/images'

const setup_env = (extra: Record<string, string> = {}) => ({
  ...PLAN,
  ARABLYZER_PLAN_ACCOUNT_PDF_PER_MONTH: '2',
  ...extra,
})

function setup(options: { accounts?: boolean; env?: Record<string, string> } = {}) {
  const tables: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [] }
  const scans = new MemoryScanStore()
  const data = new MemoryAccountData(scans)
  const crawls = new MemoryCrawlData()
  const pdfs = new MemoryPdfData()
  const monitors = new MemoryMonitorData(data, scans)
  const auth = createAuth({
    site: SITE,
    secret: 'a'.repeat(40),
    database: memoryAdapter(tables),
    google: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
    production: false,
    beforeDelete: async (userId) => {
      await data.eraseUser(userId)
      await crawls.eraseUser(userId)
      await pdfs.eraseUser(userId)
    },
    log: () => undefined,
  })
  const accounts: AccountsDeps = {
    auth,
    limits: { signIn: { scans: 1000, seconds: 60 } },
    secureCookies: false,
    data,
    plans: planCatalogFrom(setup_env(options.env), ANONYMOUS),
    crawls,
    crawlSettings: DEFAULT_CRAWL_SETTINGS,
    pdfs,
    monitors,
    sender: { send: () => Promise.resolve({ status: 204, ok: true }) },
    mail: { available: false, send: () => Promise.resolve(false) },
  }
  const app = createApp({
    limits: ANONYMOUS,
    policy: DEFAULT_POLICY,
    resolver: () => Promise.resolve([{ address: '93.184.215.14', family: 4 }]),
    turnstile: () => Promise.resolve(true),
    limiter: new MemoryRateLimiter(),
    store: scans,
    queue: new MemoryScanQueue(),
    events: new MemoryScanEvents(20),
    inFlight: new MemoryInFlight(),
    address: () => '203.0.113.9',
    connectionKey: (a) => `key-of-${a}`,
    newId: () => 'scan'.padEnd(22, '0'),
    origin: SITE.origin,
    now: () => NOW,
    ...(options.accounts === false ? {} : { accounts }),
  })
  const send = (
    method: string,
    path: string,
    body?: unknown,
    cookie?: string,
    raw?: { bytes: Uint8Array; type: string },
  ) =>
    app.request(path, {
      method,
      headers: {
        origin: SITE.origin,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(raw === undefined ? {} : { 'content-type': raw.type }),
        ...(cookie === undefined ? {} : { cookie }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(raw === undefined ? {} : { body: raw.bytes }),
    })
  const signIn = async (sub: string) => {
    stubGoogle(idToken({ sub, email: `${sub}@example.com` }))
    const response = await send('POST', '/api/session/one-tap', {
      credential: idToken({ sub, email: `${sub}@example.com` }),
    })
    expect(response.status).toBe(200)
    const cookie = response.headers
      .getSetCookie()
      .map((line) => line.split(';')[0])
      .join('; ')
    const me = (await (await send('GET', '/api/account', undefined, cookie)).json()) as {
      id: string
    }
    return { cookie, userId: me.id }
  }
  const keep = async (
    userId: string,
    name: string,
    report: ReturnType<typeof reportOf> | null,
    tool?: string,
  ) => {
    await scans.create({
      id: id(name),
      url: SHOP,
      createdAt: NOW,
      ...(tool === undefined ? {} : { tool }),
    })
    if (report === null) await scans.fail(id(name), NOW)
    else {
      await scans.start(id(name), NOW)
      await scans.finish(id(name), report, NOW)
    }
    await data.link({ userId, scanId: id(name), url: SHOP, source: 'manual', createdAt: NOW })
    return id(name)
  }
  return { send, signIn, keep, pdfs, scans, data, app }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const PNG = png(64, 32)
const asked = (scan: string) => ({ kind: 'scan', id: scan, language: 'ar' })

describe('POST /api/pdf', () => {
  it('queues a PDF of the person’s own finished scan, one at a time, within the month’s allowance', async () => {
    const { send, signIn, keep, pdfs } = setup()
    const { cookie, userId } = await signIn('ali')
    const scan = await keep(userId, 'mine', reportOf(80))
    const first = await send('POST', '/api/pdf', asked(scan), cookie)
    expect(first.status).toBe(202)
    const job = (await first.json()) as PdfSummary
    expect(job).toMatchObject({ kind: 'scan', subject: scan, language: 'ar', state: 'queued' })
    // A second while the first is queued is refused: one at a time.
    expect((await send('POST', '/api/pdf', asked(scan), cookie)).status).toBe(409)
    // Once it is done, the second of the month is fine and the third is not (the plan says 2).
    await pdfs.claim(NOW, new Date(NOW.getTime() + 1000))
    await pdfs.finish(job.id, new Uint8Array([37, 80, 68, 70]), NOW)
    const second = await send('POST', '/api/pdf', asked(scan), cookie)
    expect(second.status).toBe(202)
    await pdfs.claim(NOW, new Date(NOW.getTime() + 1000))
    await pdfs.finish(((await second.json()) as PdfSummary).id, new Uint8Array([1]), NOW)
    const third = await send('POST', '/api/pdf', asked(scan), cookie)
    expect(third.status).toBe(403)
    expect(await third.json()).toMatchObject({ error: 'plan-limit', limit: 'pdfPerMonth' })
    const list = (await (await send('GET', '/api/pdf', undefined, cookie)).json()) as PdfsResponse
    expect(list.allowance).toEqual({ perMonth: 2, used: 2 })
    expect(list.pdfs).toHaveLength(2)
  })

  it('refuses what is not the person’s, what is not a finished whole-page scan, and what is not a request', async () => {
    const { send, signIn, keep } = setup()
    const ali = await signIn('ali')
    const sara = await signIn('sara')
    const hers = await keep(sara.userId, 'hers', reportOf(80))
    const tool = await keep(ali.userId, 'tool', reportOf(80), 'robots-txt')
    const failed = await keep(ali.userId, 'failed', null)
    expect((await send('POST', '/api/pdf', asked(hers), ali.cookie)).status).toBe(404)
    expect(
      (await send('POST', '/api/pdf', asked('nobody'.padEnd(22, '_')), ali.cookie)).status,
    ).toBe(404)
    expect((await send('POST', '/api/pdf', asked(tool), ali.cookie)).status).toBe(422)
    expect((await send('POST', '/api/pdf', asked(failed), ali.cookie)).status).toBe(422)
    for (const bad of [
      {},
      { kind: 'scan' },
      { kind: 'scan', id: 'short', language: 'ar' },
      { ...asked(hers), extra: 1 },
      { ...asked(hers), language: 'fr' },
    ]) {
      expect((await send('POST', '/api/pdf', bad, ali.cookie)).status, JSON.stringify(bad)).toBe(
        400,
      )
    }
    // Two reports of different scans of one site are compared; one of another person's is a 404.
    const mine = await keep(ali.userId, 'one', reportOf(70))
    const mine2 = await keep(ali.userId, 'two', reportOf(75))
    const pair = await send(
      'POST',
      '/api/pdf',
      { kind: 'compare-scans', base: mine, head: mine2, language: 'en' },
      ali.cookie,
    )
    expect(pair.status).toBe(202)
  })

  it('serves a finished file to its owner alone, as an attachment that cannot run as a page', async () => {
    const { send, signIn, keep, pdfs } = setup()
    const ali = await signIn('ali')
    const sara = await signIn('sara')
    const scan = await keep(ali.userId, 'mine', reportOf(80))
    const job = (await (
      await send('POST', '/api/pdf', asked(scan), ali.cookie)
    ).json()) as PdfSummary
    expect((await send('GET', `/api/pdf/${job.id}/file`, undefined, ali.cookie)).status).toBe(404)
    await pdfs.claim(NOW, new Date(NOW.getTime() + 1000))
    await pdfs.finish(job.id, new Uint8Array([37, 80, 68, 70, 45]), NOW)
    const file = await send('GET', `/api/pdf/${job.id}/file`, undefined, ali.cookie)
    expect(file.status).toBe(200)
    expect(file.headers.get('content-type')).toBe('application/pdf')
    expect(file.headers.get('content-disposition')).toMatch(
      /^attachment; filename="arablyzer-scan-[A-Za-z0-9]+\.pdf"$/,
    )
    expect(file.headers.get('x-content-type-options')).toBe('nosniff')
    expect(file.headers.get('cache-control')).toBe('no-store')
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([37, 80, 68, 70, 45]))
    for (const path of [`/api/pdf/${job.id}`, `/api/pdf/${job.id}/file`]) {
      expect((await send('GET', path, undefined, sara.cookie)).status).toBe(404)
    }
    expect((await send('DELETE', `/api/pdf/${job.id}`, undefined, sara.cookie)).status).toBe(404)
    expect((await send('DELETE', `/api/pdf/${job.id}`, undefined, ali.cookie)).status).toBe(204)
  })

  it('wants a session and the site’s own origin, and is not there with accounts off', async () => {
    const { send, signIn, keep, app } = setup()
    const { cookie, userId } = await signIn('ali')
    const scan = await keep(userId, 'mine', reportOf(80))
    expect((await send('POST', '/api/pdf', asked(scan))).status).toBe(401)
    expect((await send('GET', '/api/pdf')).status).toBe(401)
    const foreign = await app.request('/api/pdf', {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json', cookie },
      body: JSON.stringify(asked(scan)),
    })
    expect(foreign.status).toBe(400)
    const off = setup({ accounts: false })
    for (const [method, path] of [
      ['POST', '/api/pdf'],
      ['GET', '/api/pdf'],
      ['GET', '/api/account/brand'],
      ['PUT', '/api/account/brand/logo'],
      ['GET', `/api/reports/${id('x')}/brand`],
    ] as const) {
      expect(
        (await off.send(method, path, method === 'POST' ? asked(scan) : undefined)).status,
        `${method} ${path}`,
      ).toBe(404)
    }
  })

  it('leaves nothing of the account’s PDFs and brand when it is erased', async () => {
    const { send, signIn, keep, pdfs } = setup({
      env: { ARABLYZER_PLAN_ACCOUNT_WHITE_LABEL: 'on' },
    })
    const { cookie, userId } = await signIn('ali')
    const scan = await keep(userId, 'mine', reportOf(80))
    const job = (await (await send('POST', '/api/pdf', asked(scan), cookie)).json()) as PdfSummary
    await send('PUT', '/api/account/brand', { name: 'شركة', color: '#0b3d2e' }, cookie)
    await send('PUT', '/api/account/brand/logo', undefined, cookie, {
      bytes: PNG,
      type: 'image/png',
    })
    expect(await pdfs.brand(userId)).not.toBeNull()
    expect((await send('DELETE', '/api/account', { confirm: true }, cookie)).status).toBe(204)
    expect(await pdfs.get(job.id)).toBeNull()
    expect(await pdfs.brand(userId)).toBeNull()
    expect(await pdfs.logo(userId)).toBeNull()
    expect(await pdfs.list(userId, 10)).toEqual([])
    expect(await pdfs.used(userId, NOW)).toBe(0)
  })
})

describe('white-label', () => {
  it('is off by default: the form says so and nothing can be saved', async () => {
    const { send, signIn } = setup()
    const { cookie } = await signIn('ali')
    const settings = (await (
      await send('GET', '/api/account/brand', undefined, cookie)
    ).json()) as BrandSettings
    expect(settings).toMatchObject({ available: false, name: '', hasLogo: false })
    const put = await send('PUT', '/api/account/brand', { name: 'X', color: null }, cookie)
    expect(put.status).toBe(403)
    expect(await put.json()).toMatchObject({ error: 'plan-limit', limit: 'whiteLabel' })
    expect(
      (
        await send('PUT', '/api/account/brand/logo', undefined, cookie, {
          bytes: PNG,
          type: 'image/png',
        })
      ).status,
    ).toBe(403)
  })

  it('keeps a name, a colour and a logo, and tells when the colour is too faint for white text', async () => {
    const { send, signIn } = setup({ env: { ARABLYZER_PLAN_ACCOUNT_WHITE_LABEL: 'on' } })
    const { cookie } = await signIn('ali')
    const saved = await send(
      'PUT',
      '/api/account/brand',
      { name: '  شركة   النور\n', color: '#0B3D2E' },
      cookie,
    )
    expect(await saved.json()).toMatchObject({
      available: true,
      name: 'شركة النور',
      color: '#0b3d2e',
      colorFallback: false,
      credit: true,
    })
    const faint = await send(
      'PUT',
      '/api/account/brand',
      { name: 'شركة', color: '#ffff00' },
      cookie,
    )
    expect(await faint.json()).toMatchObject({ color: '#ffff00', colorFallback: true })
    for (const bad of [
      { name: 'x'.repeat(61), color: null },
      { name: 'x', color: 'red' },
      { name: 'x', color: 'url(x)' },
      { name: 'x' },
    ]) {
      expect(
        (await send('PUT', '/api/account/brand', bad, cookie)).status,
        JSON.stringify(bad),
      ).toBe(400)
    }
    const up = await send('PUT', '/api/account/brand/logo', undefined, cookie, {
      bytes: PNG,
      type: 'application/octet-stream',
    })
    expect(await up.json()).toMatchObject({ hasLogo: true, logoType: 'image/png' })
    const logo = await send('GET', '/api/account/brand/logo', undefined, cookie)
    expect(logo.headers.get('content-type')).toBe('image/png')
    expect(logo.headers.get('x-content-type-options')).toBe('nosniff')
    expect(logo.headers.get('content-security-policy')).toContain('sandbox')
    // The stored picture has no text chunk of the upload.
    expect(Buffer.from(await logo.arrayBuffer()).toString('latin1')).not.toContain('secret author')
    expect(
      await (await send('DELETE', '/api/account/brand/logo', undefined, cookie)).json(),
    ).toMatchObject({ hasLogo: false })
  })

  it('refuses a logo by its bytes, whatever its type says: SVG, too big, not a picture', async () => {
    const { send, signIn } = setup({ env: { ARABLYZER_PLAN_ACCOUNT_WHITE_LABEL: 'on' } })
    const { cookie } = await signIn('ali')
    const put = (bytes: Uint8Array, type = 'image/png') =>
      send('PUT', '/api/account/brand/logo', undefined, cookie, { bytes, type })
    const refused = async (response: Response, why: string) => {
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ error: 'bad-request', logo: why })
    }
    await refused(await put(svg(), 'image/png'), 'type')
    await refused(await put(svg(), 'image/svg+xml'), 'type')
    await refused(await put(png(5000, 10)), 'dimensions')
    await refused(await put(png(10, 10, 300 * 1024)), 'too-large')
    await refused(await put(new TextEncoder().encode('hello')), 'type')
    // A real picture sent under another name is still a picture: the bytes decide.
    expect((await put(jpegBytes(), 'text/plain')).status).toBe(200)
  })

  it('shows a shared report the company’s mark while its plan has white-label, and nothing otherwise', async () => {
    const on = setup({ env: { ARABLYZER_PLAN_ACCOUNT_WHITE_LABEL: 'on' } })
    const { cookie, userId } = await on.signIn('ali')
    const scan = await on.keep(userId, 'mine', reportOf(80))
    await on.scans.create({ id: id('anon'), url: SHOP, createdAt: NOW })
    expect((await on.send('GET', `/api/reports/${scan}/brand`)).status).toBe(404)
    await on.send('PUT', '/api/account/brand', { name: 'شركة النور', color: '#ffff00' }, cookie)
    await on.send('PUT', '/api/account/brand/logo', undefined, cookie, {
      bytes: PNG,
      type: 'image/png',
    })
    const brand = await on.send('GET', `/api/reports/${scan}/brand`)
    expect(brand.status).toBe(200)
    // Public, and with the contrast guard applied: a faint colour is not sent.
    expect(await brand.json()).toEqual({
      name: 'شركة النور',
      color: '#3730a3',
      hasLogo: true,
      credit: true,
    })
    const logo = await on.send('GET', `/api/reports/${scan}/brand/logo`)
    expect(logo.headers.get('content-type')).toBe('image/png')
    // A scan no account keeps shows no brand; a malformed id is a 404.
    expect((await on.send('GET', `/api/reports/${id('anon')}/brand`)).status).toBe(404)
    expect((await on.send('GET', '/api/reports/not-an-id/brand')).status).toBe(404)
    // With the credit removed by the plan, the line is not asked for.
    const bare = setup({
      env: {
        ARABLYZER_PLAN_ACCOUNT_WHITE_LABEL: 'on',
        ARABLYZER_PLAN_ACCOUNT_WHITE_LABEL_CREDIT: 'off',
      },
    })
    const me = await bare.signIn('omar')
    const mine = await bare.keep(me.userId, 'bare', reportOf(80))
    await bare.send('PUT', '/api/account/brand', { name: 'Omar', color: null }, me.cookie)
    expect(await (await bare.send('GET', `/api/reports/${mine}/brand`)).json()).toMatchObject({
      credit: false,
    })
    // A plan without white-label shows nothing, though a brand was stored.
    await on.pdfs.setBrand(userId, { name: 'x', color: null }, NOW)
    const off = setup()
    const other = await off.signIn('lina')
    const hers = await off.keep(other.userId, 'hers', reportOf(80))
    await off.pdfs.setBrand(other.userId, { name: 'Lina', color: null }, NOW)
    expect((await off.send('GET', `/api/reports/${hers}/brand`)).status).toBe(404)
  })
})

function jpegBytes(): Uint8Array {
  return jpeg(40, 40)
}

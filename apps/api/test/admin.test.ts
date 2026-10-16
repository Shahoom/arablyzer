import { erasedRef } from '@arablyzer/store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FRESH_HOURS } from '../src/admin/routes'
import { setup, SITE } from './support/admin-app'

afterEach(() => {
  vi.unstubAllGlobals()
})

const text = (response: Response) => response.text()

/** Every route the panel has, as a visitor could ask for it. */
const ROUTES: readonly (readonly [string, string])[] = [
  ['GET', '/admin'],
  ['GET', '/admin/'],
  ['GET', '/admin/users'],
  ['GET', '/admin/users/someone'],
  ['GET', '/admin/scans'],
  ['GET', '/admin/audit'],
  ['GET', '/admin/settings'],
  ['GET', '/admin/reauth'],
  ['GET', '/admin/assets/admin.css'],
  ['GET', '/admin/not-a-page'],
  ['POST', '/admin/signout'],
  ['POST', '/admin/users/someone/suspend'],
  ['POST', '/admin/users/someone/unsuspend'],
  ['POST', '/admin/users/someone/revoke-sessions'],
  ['POST', '/admin/users/someone/overrides'],
  ['POST', '/admin/users/someone/delete'],
  ['POST', '/admin/users/someone/keys/AAAAAAAAAAAAAAAAAAAAAA/revoke'],
  ['POST', '/admin/scans/AAAAAAAAAAAAAAAAAAAAAA/delete'],
]

describe('who the panel exists for', () => {
  it('is a 404, the same as an unknown address, for everyone who is not an administrator', async () => {
    const { request, signIn } = setup()
    const unknown = await request('GET', '/nowhere')
    expect(unknown.status).toBe(404)
    const reference = { body: await text(unknown), type: unknown.headers.get('content-type') }
    const ali = await signIn('ali')
    for (const cookie of [undefined, ali, 'arablyzer.session_token=forged']) {
      for (const [method, path] of ROUTES) {
        const response = await request(method, path, {
          cookie,
          form: method === 'POST' ? { confirm: 'yes' } : undefined,
        })
        const label = `${method} ${path} as ${cookie === undefined ? 'nobody' : cookie.slice(0, 12)}`
        expect(response.status, label).toBe(404)
        expect(await text(response), label).toBe(reference.body)
        expect(response.headers.get('content-type'), label).toBe(reference.type)
        expect(response.headers.get('set-cookie'), label).toBeNull()
      }
    }
  })

  it('does not mount the panel when no administrator is named', async () => {
    const { request, signIn } = setup({ emails: [] })
    const boss = await signIn('boss')
    for (const [method, path] of ROUTES) {
      expect((await request(method, path, { cookie: boss })).status, `${method} ${path}`).toBe(404)
    }
  })

  it('wants the address to be exactly one named, and Google to vouch for it', async () => {
    const { request, signIn } = setup({ emails: ['boss@example.com'] })
    // Another address that merely contains the name, or differs in case, is nobody.
    const near = await signIn('boss2')
    expect((await request('GET', '/admin', { cookie: near })).status).toBe(404)
    const boss = await signIn('boss')
    expect((await request('GET', '/admin', { cookie: boss })).status).toBe(200)
  })

  it('shows the administrator the panel, in Arabic by default, never indexed, with no script and no style attribute', async () => {
    const { request, signIn } = setup()
    const boss = await signIn('boss')
    await signIn('ali')
    for (const path of [
      '/admin',
      '/admin/users',
      '/admin/scans',
      '/admin/audit',
      '/admin/settings',
    ]) {
      for (const lang of ['', '?lang=en']) {
        const response = await request('GET', `${path}${lang}`, { cookie: boss })
        expect(response.status, path).toBe(200)
        const html = await text(response)
        expect(html, path).toContain(
          lang === '' ? '<html lang="ar" dir="rtl">' : '<html lang="en" dir="ltr">',
        )
        expect(html).toContain('<meta name="robots" content="noindex, nofollow">')
        expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
        expect(html).toContain('http-equiv="Content-Security-Policy"')
        expect(html).not.toMatch(/<script/i)
        expect(html).not.toMatch(/\sstyle\s*=/i)
        expect(html).not.toMatch(/\son[a-z]+\s*=/i)
        expect(html).not.toMatch(
          /<(?:link|img|iframe|object|embed)[^>]+(?:https?:)?\/\/(?!arablyzer)/i,
        )
      }
    }
    const css = await request('GET', '/admin/assets/admin.css', { cookie: boss })
    expect(css.headers.get('content-type')).toContain('text/css')
    expect(await text(css)).toContain('prefers-color-scheme: dark')
  })

  it('escapes what an account is called', async () => {
    const { request, signIn } = setup()
    const boss = await signIn('boss')
    await signIn('evil', '<img src=x onerror=alert(1)>"\'')
    const page = await text(await request('GET', '/admin/users', { cookie: boss }))
    expect(page).not.toContain('<img src=x')
    expect(page).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
})

describe('how fresh the sign-in is, and how often the panel may be asked', () => {
  it('sends an administrator whose sign-in is old to sign in again, and only then', async () => {
    let skew = 0
    const { request, signIn } = setup({ now: () => new Date(Date.now() + skew) })
    const boss = await signIn('boss')
    skew = (FRESH_HOURS - 1) * 3600_000
    expect((await request('GET', '/admin', { cookie: boss })).status).toBe(200)
    skew = (FRESH_HOURS + 1) * 3600_000
    for (const path of ['/admin', '/admin/users', '/admin/audit']) {
      const stale = await request('GET', path, { cookie: boss })
      expect(stale.status, path).toBe(302)
      expect(stale.headers.get('location')).toBe('/admin/reauth')
    }
    const posted = await request('POST', '/admin/users/someone/suspend', {
      cookie: boss,
      form: { confirm: 'yes' },
    })
    expect(posted.status).toBe(302)
    // The page that says so, and its stylesheet, open; and signing out sends to the sign-in page.
    const again = await request('GET', '/admin/reauth?lang=en', { cookie: boss })
    expect(again.status).toBe(200)
    expect(await text(again)).toContain('Sign in again')
    expect((await request('GET', '/admin/assets/admin.css', { cookie: boss })).status).toBe(200)
    const out = await request('POST', '/admin/signout?lang=en', { cookie: boss })
    expect(out.status).toBe(303)
    expect(out.headers.get('location')).toBe('/en/login')
    expect(out.headers.getSetCookie().join('\n')).toMatch(/session_token=;/)
    skew = 0
    // The session is gone: nothing opens, and it looks like nothing is there.
    expect((await request('GET', '/admin', { cookie: boss })).status).toBe(404)
  })

  it('limits an administrator, and a visitor who only probes still sees a 404', async () => {
    const { request, signIn } = setup()
    const boss = await signIn('boss')
    const ali = await signIn('ali')
    let limited = 0
    for (let i = 0; i < 130; i++) {
      const response = await request('GET', '/admin/settings', { cookie: boss })
      if (response.status === 429) {
        limited++
        expect(response.headers.get('retry-after')).toMatch(/^\d+$/)
      } else expect(response.status).toBe(200)
    }
    expect(limited).toBeGreaterThan(0)
    for (let i = 0; i < 310; i++) {
      expect((await request('GET', '/admin', { cookie: ali })).status).toBe(404)
    }
  })

  it('refuses a post from another site, or without the second click', async () => {
    const { request, signIn, userId } = setup()
    const boss = await signIn('boss')
    await signIn('ali')
    const id = userId('ali')
    const foreign = await request('POST', `/admin/users/${id}/suspend`, {
      cookie: boss,
      form: { confirm: 'yes' },
      origin: 'https://evil.example',
    })
    expect(foreign.status).toBe(400)
    const none = await request('POST', `/admin/users/${id}/suspend`, {
      cookie: boss,
      form: { confirm: 'yes' },
      origin: null,
    })
    expect(none.status).toBe(400)
    const unconfirmed = await request('POST', `/admin/users/${id}/suspend`, {
      cookie: boss,
      form: {},
    })
    expect(unconfirmed.headers.get('location')).toContain('error=confirm')
    const detail = await text(await request('GET', `/admin/users/${id}`, { cookie: boss }))
    expect(detail).not.toContain('chip bad')
  })
})

describe('suspending an account', () => {
  it('ends its sessions, and closes sign-in, the API key and its scans, until it is lifted', async () => {
    const { request, signIn, signInResponse, userId, withKey, call } = setup()
    const boss = await signIn('boss')
    const ali = await signIn('ali')
    const secret = await withKey(ali)
    expect((await request('GET', '/api/account', { cookie: ali })).status).toBe(200)
    expect((await call('GET', '/api/v1/tools?limit=1', secret)).status).toBe(200)
    const id = userId('ali')

    const done = await request('POST', `/admin/users/${id}/suspend`, {
      cookie: boss,
      form: { confirm: 'yes' },
    })
    expect(done.status).toBe(303)
    expect(done.headers.get('location')).toBe(`/admin/users/${id}?done=suspend`)

    // Its session is gone, and so is what the session opened.
    expect((await request('GET', '/api/account', { cookie: ali })).status).toBe(401)
    expect((await request('GET', '/api/sites', { cookie: ali })).status).toBe(401)
    expect(
      (await request('POST', '/api/sites', { cookie: ali, json: { url: 'https://example.com/' } }))
        .status,
    ).toBe(401)
    // The key opens nothing.
    for (const [method, path, body] of [
      ['GET', '/api/v1/tools?limit=1', undefined],
      ['POST', '/api/v1/scans', { url: 'https://example.com/' }],
    ] as const) {
      const refused = await call(method, path, secret, body)
      expect(refused.status, path).toBe(401)
    }
    // And it cannot sign in again, by any way.
    const again = await signInResponse('ali')
    expect(again.status).not.toBe(200)
    expect(again.headers.getSetCookie().join('\n')).not.toMatch(/session_token=[^;]/)
    expect(
      await text(await request('GET', `/admin/users/${id}?lang=en`, { cookie: boss })),
    ).toContain('Lift the suspension')

    // Lifted, it is whole again: the same key works and it can sign in.
    const lifted = await request('POST', `/admin/users/${id}/unsuspend`, {
      cookie: boss,
      form: { confirm: 'yes' },
    })
    expect(lifted.headers.get('location')).toBe(`/admin/users/${id}?done=unsuspend`)
    expect((await call('GET', '/api/v1/tools?limit=1', secret)).status).toBe(200)
    const back = await signInResponse('ali')
    expect(back.status).toBe(200)
  })

  it('is not done to the administrator’s own account, and the account named must exist', async () => {
    const { request, signIn, userId } = setup()
    const boss = await signIn('boss')
    const mine = userId('boss')
    for (const action of ['suspend', 'delete']) {
      const refused = await request('POST', `/admin/users/${mine}/${action}`, {
        cookie: boss,
        form: { confirm: 'yes', email: ADMIN },
      })
      expect(refused.headers.get('location'), action).toContain('error=self')
    }
    expect((await request('GET', '/api/account', { cookie: boss })).status).toBe(200)
    const missing = await request('POST', '/admin/users/nobody/suspend', {
      cookie: boss,
      form: { confirm: 'yes' },
    })
    expect(missing.headers.get('location')).toContain('error=missing')
  })

  it('notes each sign-in, for the account’s last one', async () => {
    const { signIn, admin, userId } = setup()
    await signIn('ali')
    expect((await admin.state(userId('ali'))).lastSignInAt).toBeInstanceOf(Date)
  })
})

const ADMIN = 'boss@example.com'

describe('limits set for one account', () => {
  const add = (request: ReturnType<typeof setup>['request'], cookie: string, path: string) =>
    request('POST', '/api/sites', { cookie, json: { url: `https://example.com/${path}` } })

  it('are read before the plan: saved sites, then back to the plan when cleared', async () => {
    const { request, signIn, userId } = setup()
    const boss = await signIn('boss')
    const ali = await signIn('ali')
    const id = userId('ali')
    expect((await add(request, ali, 'a')).status).toBe(201)
    expect((await add(request, ali, 'b')).status).toBe(201)
    expect((await add(request, ali, 'c')).status).toBe(403)
    const set = await request('POST', `/admin/users/${id}/overrides`, {
      cookie: boss,
      form: {
        confirm: 'yes',
        savedSites: '3',
        scansPerDay: '',
        crawlPages: '',
        pdfPerMonth: '',
        monitoredSites: '',
        whiteLabel: '',
      },
    })
    expect(set.headers.get('location')).toBe(`/admin/users/${id}?done=overrides`)
    expect((await add(request, ali, 'c')).status).toBe(201)
    expect((await add(request, ali, 'd')).status).toBe(403)
    const list = (await (await request('GET', '/api/sites', { cookie: ali })).json()) as {
      limit: number
    }
    expect(list.limit).toBe(3)
    // Others keep the plan's number.
    const bea = await signIn('bea')
    expect((await add(request, bea, 'a')).status).toBe(201)
    expect((await add(request, bea, 'b')).status).toBe(201)
    expect((await add(request, bea, 'c')).status).toBe(403)
    // Cleared, the account is on the plan again.
    await request('POST', `/admin/users/${id}/overrides`, {
      cookie: boss,
      form: { confirm: 'yes' },
    })
    expect((await add(request, ali, 'e')).status).toBe(403)
    expect(
      ((await (await request('GET', '/api/sites', { cookie: ali })).json()) as { limit: number })
        .limit,
    ).toBe(2)
  })

  it('hold the scans of a day to the number, and the API keys with them', async () => {
    const { request, signIn, userId, withKey, call } = setup()
    const boss = await signIn('boss')
    const ali = await signIn('ali')
    const secret = await withKey(ali)
    await request('POST', `/admin/users/${userId('ali')}/overrides`, {
      cookie: boss,
      form: { confirm: 'yes', scansPerDay: '1' },
    })
    const scan = (url: string) =>
      request('POST', '/api/scans', { cookie: ali, json: { url, turnstileToken: 'human' } })
    expect((await scan('https://example.com/a')).status).toBe(202)
    const second = await scan('https://example.com/b')
    expect(second.status).toBe(429)
    expect(Number(second.headers.get('retry-after'))).toBeGreaterThan(3600)
    const viaKey = await call('POST', '/api/v1/scans', secret, { url: 'https://example.com/c' })
    expect(viaKey.status).toBe(429)
  })

  it('refuse a number that is not whole or not in range, and change nothing', async () => {
    const { request, signIn, userId, admin } = setup()
    const boss = await signIn('boss')
    await signIn('ali')
    const id = userId('ali')
    const bads: Record<string, string>[] = [
      { savedSites: '-1' },
      { savedSites: '1.5' },
      { scansPerDay: '0' },
      { crawlPages: 'many' },
      { pdfPerMonth: '10001' },
      { savedSites: '1e3' },
    ]
    for (const bad of bads) {
      const refused = await request('POST', `/admin/users/${id}/overrides`, {
        cookie: boss,
        form: { confirm: 'yes', ...bad },
      })
      expect(refused.headers.get('location'), JSON.stringify(bad)).toContain('error=numbers')
    }
    expect((await admin.state(id)).overrides).toEqual({})
    await request('POST', `/admin/users/${id}/overrides`, {
      cookie: boss,
      form: { confirm: 'yes', whiteLabel: 'on', pdfPerMonth: '0' },
    })
    expect((await admin.state(id)).overrides).toEqual({ whiteLabel: true, pdfPerMonth: 0 })
  })
})

describe('sessions, keys and reports', () => {
  it('ends every session of an account, and revokes one key', async () => {
    const { request, signIn, userId, withKey, call, keys } = setup()
    const boss = await signIn('boss')
    const ali = await signIn('ali')
    const secret = await withKey(ali)
    const id = userId('ali')
    const [key] = await keys.list(id)
    const revoked = await request('POST', `/admin/users/${id}/keys/${key?.id ?? ''}/revoke`, {
      cookie: boss,
      form: { confirm: 'yes' },
    })
    expect(revoked.headers.get('location')).toBe(`/admin/users/${id}?done=key`)
    expect((await call('GET', '/api/v1/tools?limit=1', secret)).status).toBe(401)
    const again = await request('POST', `/admin/users/${id}/keys/${key?.id ?? ''}/revoke`, {
      cookie: boss,
      form: { confirm: 'yes' },
    })
    expect(again.headers.get('location')).toContain('error=missing')
    expect((await request('GET', '/api/account', { cookie: ali })).status).toBe(200)
    const ended = await request('POST', `/admin/users/${id}/revoke-sessions`, {
      cookie: boss,
      form: { confirm: 'yes' },
    })
    expect(ended.headers.get('location')).toBe(`/admin/users/${id}?done=sessions`)
    expect((await request('GET', '/api/account', { cookie: ali })).status).toBe(401)
  })

  it('lists scans by state and host, and deletes a report whoever it is of', async () => {
    const { request, signIn, scans } = setup()
    const boss = await signIn('boss')
    const ali = await signIn('ali')
    const made = await request('POST', '/api/scans', {
      cookie: ali,
      json: { url: 'https://shop.example.net/a', turnstileToken: 'human' },
    })
    const { id } = (await made.json()) as { id: string }
    const list = await text(
      await request('GET', '/admin/scans?host=SHOP.example&state=queued&lang=en', { cookie: boss }),
    )
    expect(list).toContain('https://shop.example.net/a')
    expect(list).toContain('ali@example.com')
    expect(
      await text(await request('GET', '/admin/scans?host=other', { cookie: boss })),
    ).not.toContain('shop.example.net/a')
    const removed = await request('POST', `/admin/scans/${id}/delete`, {
      cookie: boss,
      form: { confirm: 'yes' },
    })
    expect(removed.headers.get('location')).toContain('done=scan')
    expect(await scans.get(id)).toBeNull()
    const gone = await request('POST', `/admin/scans/${id}/delete`, {
      cookie: boss,
      form: { confirm: 'yes' },
    })
    expect(gone.headers.get('location')).toContain('error=missing')
  })

  it('shows an account in full, and writes down that it was looked at', async () => {
    const { request, signIn, userId, withKey } = setup()
    const boss = await signIn('boss')
    const ali = await signIn('ali')
    await withKey(ali, 'Deploy')
    await request('POST', '/api/sites', { cookie: ali, json: { url: 'https://example.com/x' } })
    const id = userId('ali')
    const page = await text(await request('GET', `/admin/users/${id}?lang=en`, { cookie: boss }))
    for (const wanted of [
      'ali@example.com',
      'https://example.com/x',
      'Deploy',
      'arb_',
      'Plan and usage',
      'Delete the account',
    ]) {
      expect(page, wanted).toContain(wanted)
    }
    // Only the key's prefix is shown, never its hash or a secret.
    expect(page).not.toMatch(/arb_[A-Za-z0-9_-]{9,}/)
    const audit = await text(await request('GET', '/admin/audit?lang=en', { cookie: boss }))
    expect(audit).toContain('Opened an account')
    expect(audit).toContain('203.0.113.0/24')
    expect(audit).not.toContain('203.0.113.9')
    expect((await request('GET', '/admin/users/not%20an%20id', { cookie: boss })).status).toBe(404)
    expect(
      (await request('GET', '/admin/users/nobody1234567890123456', { cookie: boss })).status,
    ).toBe(404)
    // Search finds by address and by name.
    expect(await text(await request('GET', '/admin/users?q=ALI@', { cookie: boss }))).toContain(
      'ali@example.com',
    )
    expect(await text(await request('GET', '/admin/users?q=zzz', { cookie: boss }))).not.toContain(
      'ali@example.com',
    )
  })
})

describe('erasing an account', () => {
  it('wants its address typed, takes what the owner kept of it, and keeps the audit with a hash for its id', async () => {
    const { request, signIn, userId, admin, tables, keys, withKey } = setup()
    const boss = await signIn('boss')
    const ali = await signIn('ali')
    await withKey(ali)
    const id = userId('ali')
    await request('POST', `/admin/users/${id}/overrides`, {
      cookie: boss,
      form: { confirm: 'yes', savedSites: '9' },
    })
    await request('POST', `/admin/users/${id}/suspend`, { cookie: boss, form: { confirm: 'yes' } })
    const wrong = await request('POST', `/admin/users/${id}/delete`, {
      cookie: boss,
      form: { confirm: 'yes', email: 'ali@example.org' },
    })
    expect(wrong.headers.get('location')).toContain('error=email')
    expect(tables.user?.some((u) => u.id === id)).toBe(true)
    const noClick = await request('POST', `/admin/users/${id}/delete`, {
      cookie: boss,
      form: { email: 'ali@example.com' },
    })
    expect(noClick.headers.get('location')).toContain('error=confirm')

    const gone = await request('POST', `/admin/users/${id}/delete`, {
      cookie: boss,
      form: { confirm: 'yes', email: ' ALI@example.com ' },
    })
    expect(gone.status).toBe(303)
    expect(gone.headers.get('location')).toBe('/admin/users?done=deleted')
    expect(tables.user?.some((u) => u.id === id)).toBe(false)
    expect(await keys.list(id)).toEqual([])
    expect(await admin.state(id)).toMatchObject({ suspendedAt: null, overrides: {} })

    const log = (await admin.auditLog({ limit: 100, offset: 0 })).rows
    expect(JSON.stringify(log)).not.toContain('ali@example.com')
    expect(JSON.stringify(log)).not.toContain(id)
    const mine = log.filter((row) => row.targetId === erasedRef(id))
    expect(mine.map((row) => row.action).sort()).toEqual([
      'user.delete',
      'user.overrides',
      'user.suspend',
    ])
    for (const row of mine) expect(row.targetEmail).toBeNull()
    // The panel says "erased account" where the address was, and the actor is still the owner.
    const page = await text(await request('GET', '/admin/audit?lang=en', { cookie: boss }))
    expect(page).toContain('Erased account')
    expect(page).toContain(ADMIN)
    expect(page).not.toContain('ali@example.com')
    expect((await request('GET', `/admin/users/${id}`, { cookie: boss })).status).toBe(404)
  })

  it('is also what the account’s own deletion runs: it leaves no state, and scrubs the audit', async () => {
    const { request, signIn, userId, admin } = setup()
    const boss = await signIn('boss')
    const bea = await signIn('bea')
    const id = userId('bea')
    await request('POST', `/admin/users/${id}/overrides`, {
      cookie: boss,
      form: { confirm: 'yes', pdfPerMonth: '7' },
    })
    expect((await admin.state(id)).overrides).toEqual({ pdfPerMonth: 7 })
    const removed = await request('DELETE', '/api/account', {
      cookie: bea,
      json: { confirm: true },
    })
    expect(removed.status).toBe(204)
    expect((await admin.state(id)).overrides).toEqual({})
    const rows = (await admin.auditLog({ limit: 50, offset: 0 })).rows
    expect(JSON.stringify(rows)).not.toContain('bea@example.com')
    expect(rows.some((row) => row.targetId === erasedRef(id))).toBe(true)
  })
})

describe('settings', () => {
  it('shows the plan’s numbers and the features, read only', async () => {
    const { request, signIn } = setup()
    const boss = await signIn('boss')
    const page = await text(await request('GET', '/admin/settings?lang=en', { cookie: boss }))
    expect(page).toContain('4 per 60 seconds')
    expect(page).toContain('Free account')
    expect(page).toContain(process.version)
    expect(page).not.toContain('<form')
    expect(SITE.origin).toBe('https://arablyzer.example')
  })
})

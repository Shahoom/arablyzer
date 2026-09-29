import type { Resolver } from '@arablyzer/egress'
import { trap, type Trap } from '@arablyzer/fixtures'
import { RULES, type Rule } from '@arablyzer/rules'
import { afterEach, describe, expect, it } from 'vitest'
import { scan } from '../../src/index'
import { policyFor, resolverFor, tempSite, testRule, type TempSite } from '../helpers'

// M2.3c: link-broken asks for the page's links, and so widens what a scan fetches (m2.3 plan §4).
// Only the page's own origin is asked, each link once, through safeFetch under the page's own
// policy, which vets every address; no redirect is followed. A link can reach no local service.

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

/** A rule that reads the links' checks, as link-broken does: it fails on each 4xx or 5xx. */
function linkRule(): Rule {
  return testRule({
    id: 'link-rule',
    needs: ['html', 'links'],
    appliesTo: (_page, evidence) => (evidence?.links?.total ?? 0) > 0,
    detect: ({ links }) =>
      (links?.checks ?? []).flatMap((check) =>
        check.outcome === 'answered' && check.status >= 400
          ? [{ message: 'found' as const, values: { what: check.url }, key: check.url }]
          : [],
      ),
  })
}

async function hostile(
  files: Readonly<Record<string, string>>,
  config?: object,
): Promise<TempSite> {
  const site = await tempSite(
    { 'site.json': JSON.stringify({ host: 'shop.example' }), ...files },
    config as Parameters<typeof tempSite>[1],
  )
  cleanup.push(() => site.close())
  return site
}

async function localService(): Promise<Trap> {
  const service = await trap()
  cleanup.push(() => service.close())
  return service
}

const page = (body: string) =>
  `<!doctype html><html lang="ar" dir="rtl"><title>متجر</title><body>${body}</body></html>`

describe('the links a scan asks for', () => {
  it('are on the page’s own origin alone: local services, metadata and other ports are never asked', async () => {
    const service = await localService()
    const at = (host: string) => `http://${host}:${String(service.port)}`
    const site = await hostile({
      'index.html': page(`
        <a href="${at('127.0.0.1')}/admin">لوحة</a>
        <a href="${at('localhost')}/admin">لوحة</a>
        <a href="${at('[::1]')}/admin">لوحة</a>
        <a href="//127.0.0.1:${String(service.port)}/relative">لوحة</a>
        <a href="${at('shop.example')}/other-port">منفذ آخر</a>
        <a href="http://169.254.169.254/latest/meta-data/">بيانات</a>
        <a href="http://internal.test/">داخلي</a>
        <a href="https://user:secret@shop.example/ar/">حساب</a>
        <a href="/ar/ok/">صفحة</a>`),
      'ar/ok/index.html': page('<p>نص</p>'),
    })
    const report = await scan(site.url('/'), {
      rules: [linkRule()],
      policy: policyFor(site),
      resolver: resolverFor(site),
    })
    expect(report.rules.map((rule) => [rule.id, rule.status])).toEqual([['link-rule', 'pass']])
    expect(service.hits).toEqual([])
    expect(site.requests).toEqual(['GET /robots.txt', 'GET /', 'HEAD /ar/ok/'])
  })

  it('follow no redirect, so one to a local service is never followed', async () => {
    const service = await localService()
    const site = await hostile(
      { 'index.html': page('<a href="/ar/moved/">نُقلت</a>') },
      {
        '/ar/moved/': {
          status: 302,
          headers: { location: `http://127.0.0.1:${String(service.port)}/steal` },
        },
      },
    )
    const report = await scan(site.url('/'), {
      rules: [linkRule()],
      policy: policyFor(site),
      resolver: resolverFor(site),
    })
    expect(report.rules.map((rule) => rule.status)).toEqual(['pass'])
    expect(service.hits).toEqual([])
    expect(site.requests).toEqual(['GET /robots.txt', 'GET /', 'HEAD /ar/moved/'])
  })

  it('cannot follow a <base> that points them at a local service', async () => {
    const service = await localService()
    const site = await hostile({
      'index.html': page(
        `<base href="http://127.0.0.1:${String(service.port)}/"><a href="admin">لوحة</a>`,
      ),
    })
    await scan(site.url('/'), {
      rules: [linkRule()],
      policy: policyFor(site),
      resolver: resolverFor(site),
    })
    expect(service.hits).toEqual([])
    expect(site.requests).toEqual(['GET /robots.txt', 'GET /'])
  })

  it('are vetted again when asked for: a name that moves to a private address is refused', async () => {
    const site = await hostile({ 'index.html': page('<a href="/ar/next/">التالي</a>') })
    // robots.txt and the page get the fixture's address; every later lookup, a private one.
    let lookups = 0
    const fixture = resolverFor(site)
    const rebinding: Resolver = (hostname, signal) => {
      lookups++
      return lookups <= 2
        ? fixture(hostname, signal)
        : Promise.resolve([{ address: '10.0.0.5', family: 4 as const }])
    }
    const report = await scan(site.url('/'), {
      rules: [linkRule()],
      policy: policyFor(site),
      resolver: rebinding,
    })
    expect(lookups).toBeGreaterThan(2)
    expect(report.rules.map((rule) => [rule.status, rule.error])).toEqual([
      ['error', 'links-unchecked'],
    ])
    expect(report.scan.notices.map((notice) => notice.code)).toEqual(['links-unanswered'])
    expect(site.requests).toEqual(['GET /robots.txt', 'GET /'])
  })

  it('send nothing but HEAD and GET, and are asked for by no scan without the rule', async () => {
    const site = await hostile(
      {
        'index.html': page('<a href="/ar/a/">أ</a><a href="/ar/b/">ب</a>'),
        'ar/a/index.html': page('<p>أ</p>'),
      },
      { '/ar/b/': { status: 404 } },
    )
    const others = RULES.filter(
      (rule) => !rule.needs.includes('links') && !rule.needs.includes('render'),
    )
    await scan(site.url('/'), {
      rules: others,
      policy: policyFor(site),
      resolver: resolverFor(site),
    })
    expect(site.requests).toEqual(['GET /robots.txt', 'GET /'])
    await scan(site.url('/'), {
      rules: [linkRule()],
      policy: policyFor(site),
      resolver: resolverFor(site),
    })
    const methods = site.requests.slice(4).map((request) => request.split(' ')[0])
    expect(new Set(methods)).toEqual(new Set(['HEAD', 'GET']))
    expect(site.requests.slice(4).sort()).toEqual(['GET /ar/b/', 'HEAD /ar/a/', 'HEAD /ar/b/'])
  })
})

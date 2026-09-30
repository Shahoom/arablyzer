import { createPolicy, type Resolver, type TxtAnswer } from '@arablyzer/egress'
import { serveDoh, trap } from '@arablyzer/fixtures'
import { RULES } from '@arablyzer/rules'
import { afterEach, describe, expect, it } from 'vitest'
import { scan } from '../../src/index'
import { policyFor, resolverFor, tempSite, type TempSite } from '../helpers'

// M2.3c: the DNS rules widen what a scan asks (m2.3 plan §4). A scan asks for TXT records alone,
// of the page's organizational domain and its _dmarc name, and of nothing its page names.

let site: TempSite | undefined
afterEach(async () => {
  await site?.close()
  site = undefined
})

/** The fixture's own resolver, with every question it is asked logged as "name TYPE". */
function logged(fixture: Resolver): Resolver & { readonly asked: string[] } {
  const asked: string[] = []
  return Object.assign(
    (hostname: string, signal: AbortSignal) => {
      asked.push(`${hostname} A/AAAA`)
      return fixture(hostname, signal)
    },
    {
      asked,
      txt: (name: string, signal: AbortSignal): Promise<TxtAnswer> => {
        asked.push(`${name} TXT`)
        return fixture.txt?.(name, signal) ?? Promise.resolve({ outcome: 'none', records: [] })
      },
    },
  )
}

describe('the DNS questions a scan asks', () => {
  it("are TXT for the page's domain and its _dmarc name alone, whatever the page names", async () => {
    site = await tempSite({
      'site.json': JSON.stringify({ host: 'www.souq.example', aliases: ['souq.example'] }),
      'index.html': `<!doctype html><html lang="ar"><body>
        <a href="mailto:admin@internal.example">بريد</a>
        <a href="https://other.example/">موقع آخر</a>
        <a href="http://10.0.0.5/">داخلي</a>
        <img src="https://cdn.other.example/logo.png" alt="شعار">
        <script src="https://tracker.other.example/t.js"></script>
        <link rel="dns-prefetch" href="//prefetch.other.example">
        <p>نص</p></body></html>`,
    })
    const resolver = logged(resolverFor(site))
    const report = await scan(site.url('/'), {
      rules: RULES.filter((rule) => !rule.needs.includes('render')),
      policy: policyFor(site),
      resolver,
    })
    expect(report.rules.find((rule) => rule.id === 'spf-missing')?.status).toBe('pass')
    expect(report.rules.find((rule) => rule.id === 'dmarc-missing')?.status).toBe('pass')
    expect(resolver.asked.filter((question) => question.endsWith(' TXT')).sort()).toEqual([
      '_dmarc.souq.example TXT',
      'souq.example TXT',
    ])
    expect(new Set(resolver.asked.filter((question) => !question.endsWith(' TXT')))).toEqual(
      new Set(['www.souq.example A/AAAA']),
    )
  })

  it('are none for a page on an address or a local name', async () => {
    site = await tempSite({ 'index.html': '<!doctype html><html lang="ar"><p>نص</p></html>' })
    const resolver = logged(resolverFor(site))
    const report = await scan(site.url('/'), {
      rules: RULES.filter((rule) => rule.needs.includes('dns')),
      policy: policyFor(site),
      resolver,
    })
    expect(report.rules.map((rule) => rule.status)).toEqual(['not-applicable', 'not-applicable'])
    expect(resolver.asked).toEqual([])
  })
})

// M2.3c review: the hosted scanner asks its TXT questions over HTTPS (RFC 8484), through safeFetch
// like every request it makes. The resolver's URL is vetted like any other, and the questions are
// the same two, whatever the page names.
describe('the DNS questions a scan asks over HTTPS', () => {
  it('are the same two, for the same names, whatever the page names', async () => {
    site = await tempSite({
      'site.json': JSON.stringify({ host: 'www.souq.example', aliases: ['souq.example'] }),
      'index.html': `<!doctype html><html lang="ar"><body>
        <a href="mailto:admin@internal.example">بريد</a>
        <a href="https://other.example/">موقع آخر</a>
        <img src="https://cdn.other.example/logo.png" alt="شعار">
        <link rel="dns-prefetch" href="//prefetch.other.example">
        <p>نص</p></body></html>`,
    })
    const files = site
    const doh = await serveDoh((name) => ({ txt: files.txt(name).records }))
    try {
      const report = await scan(site.url('/'), {
        rules: RULES.filter((rule) => rule.needs.includes('dns')),
        policy: createPolicy({
          allowTargets: [
            { address: '127.0.0.1', port: site.port },
            { address: '127.0.0.1', port: doh.port },
          ],
        }),
        resolver: resolverFor(site),
        dohUrl: doh.url,
      })
      expect(report.rules.map((rule) => [rule.id, rule.status])).toEqual([
        ['dmarc-missing', 'pass'],
        ['spf-missing', 'pass'],
      ])
      expect([...doh.questions].sort()).toEqual(['_dmarc.souq.example TXT', 'souq.example TXT'])
    } finally {
      await doh.close()
    }
  })

  it('are never sent to a resolver the policy does not open: its URL is vetted like any other', async () => {
    site = await tempSite({
      'site.json': JSON.stringify({ host: 'shop.example' }),
      'index.html': '<!doctype html><html lang="ar"><p>نص</p></html>',
    })
    const service = await trap()
    const doh = await serveDoh({ 'shop.example': { txt: ['v=spf1 -all'] } })
    try {
      const policy = createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] })
      for (const url of [
        // A local service, and the resolver itself, which the policy does not name.
        `http://127.0.0.1:${String(service.port)}/dns-query`,
        doh.url,
        'http://169.254.169.254/latest/meta-data/',
        'https://localhost/dns-query',
      ]) {
        const report = await scan(site.url('/'), {
          rules: RULES.filter((rule) => rule.needs.includes('dns')),
          policy,
          resolver: resolverFor(site),
          dohUrl: url,
        })
        expect(
          report.rules.map((rule) => [rule.id, rule.status, rule.error]),
          url,
        ).toEqual([
          ['dmarc-missing', 'error', 'dns-unchecked'],
          ['spf-missing', 'error', 'dns-unchecked'],
        ])
      }
      expect(service.hits).toEqual([])
      expect(doh.requests).toEqual([])
    } finally {
      await service.close()
      await doh.close()
    }
  })
})

import type { Resolver, TxtAnswer } from '@arablyzer/egress'
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

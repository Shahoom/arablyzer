import { collectPage } from '@arablyzer/collectors'
import { createPolicy, DEFAULT_POLICY, type Resolver, type TxtAnswer } from '@arablyzer/egress'
import type { Rule } from '@arablyzer/rules'
import { afterEach, describe, expect, it } from 'vitest'
import { lookupDns } from '../src/dns'
import { evaluatePage, scan } from '../src/index'
import { policyFor, resolverFor, schemaErrors, tempSite, testRule, type TempSite } from './helpers'

// M2.3c: the rules that read DNS name the TXT records they read; the engine asks for those
// names, TXT alone, for the page's organizational domain, and for nothing else.

/** A rule that reads the TXT records of `txtName(domain)`, and finds each one. */
function txtRule(id: string, txtName: (domain: string) => string): Rule<'found'> {
  return {
    ...testRule({
      id,
      needs: ['dns'],
      detect: ({ dns }) =>
        (dns?.txt.find((lookup) => lookup.name === txtName(dns.domain))?.records ?? []).map(
          (record) => ({ message: 'found' as const, values: { what: record }, key: record }),
        ),
    }),
    txtName,
  }
}

const spfLike = txtRule('apex-rule', (domain) => domain)
const dmarcLike = txtRule('dmarc-rule', (domain) => `_dmarc.${domain}`)

type LoggedResolver = Resolver & { readonly asked: string[] }

/** A resolver that answers every TXT lookup with `answer`, and logs every name asked of it. */
function loggedResolver(answer: (name: string) => Promise<TxtAnswer>): LoggedResolver {
  const asked: string[] = []
  return Object.assign(
    (hostname: string) => {
      asked.push(`${hostname} A/AAAA`)
      return Promise.resolve([])
    },
    {
      asked,
      txt: (name: string) => {
        asked.push(`${name} TXT`)
        return answer(name)
      },
    },
  )
}

const found = (records: string[]) => () => Promise.resolve<TxtAnswer>({ outcome: 'found', records })

describe('lookupDns', () => {
  const context = (resolver: Resolver, overrides = {}) => ({
    policy: DEFAULT_POLICY,
    resolver,
    privateAccess: false,
    ...overrides,
  })

  it("asks for each name the rules read, TXT alone, under the page's organizational domain", async () => {
    const resolver = loggedResolver(found(['v=spf1 -all']))
    const lookup = await lookupDns(
      'https://www.shop.example.com.sa/ar/',
      [spfLike, dmarcLike, spfLike],
      context(resolver),
    )
    expect(resolver.asked).toEqual(['example.com.sa TXT', '_dmarc.example.com.sa TXT'])
    expect(lookup).toEqual({
      facts: {
        domain: 'example.com.sa',
        txt: [
          { name: 'example.com.sa', outcome: 'found', records: ['v=spf1 -all'] },
          { name: '_dmarc.example.com.sa', outcome: 'found', records: ['v=spf1 -all'] },
        ],
      },
      notice: null,
    })
  })

  it('asks nothing when no rule reads DNS, or the page has no public name', async () => {
    const resolver = loggedResolver(found([]))
    expect(await lookupDns('https://shop.example/', [testRule({})], context(resolver))).toBe(
      undefined,
    )
    for (const url of [
      'http://127.0.0.1:8080/',
      'http://[::1]/',
      'http://localhost:4321/',
      'http://shop.test/',
      'https://github.io/',
    ]) {
      expect(await lookupDns(url, [spfLike], context(resolver)), url).toBeUndefined()
    }
    // A public name on a private address, under --allow-private: a local build.
    expect(
      await lookupDns(
        'https://shop.example/',
        [spfLike],
        context(resolver, { privateAccess: true }),
      ),
    ).toBeUndefined()
    expect(resolver.asked).toEqual([])
  })

  it('asks nothing behind an egress proxy, which resolves every name, and says so', async () => {
    const resolver = loggedResolver(found(['v=spf1 -all']))
    const behind = context(resolver, { policy: createPolicy({ upstream: 'http://127.0.0.1:9' }) })
    expect(await lookupDns('https://shop.example/', [spfLike], behind)).toEqual({
      facts: {
        domain: 'shop.example',
        txt: [{ name: 'shop.example', outcome: 'failed', records: [] }],
      },
      notice: 'dns-unavailable',
    })
    expect(resolver.asked).toEqual([])
    // A resolver without TXT lookups can check nothing either.
    const plain: Resolver = () => Promise.resolve([])
    expect(await lookupDns('https://shop.example/', [spfLike], context(plain))).toMatchObject({
      notice: 'dns-unavailable',
    })
  })

  it('says a lookup got no answer, whether it failed, threw or ran out of time', async () => {
    const failing = loggedResolver((name) =>
      name.startsWith('_dmarc.')
        ? Promise.reject(new Error('a resolver that throws'))
        : Promise.resolve({ outcome: 'failed', records: [] }),
    )
    expect(
      await lookupDns('https://shop.example/', [spfLike, dmarcLike], context(failing)),
    ).toEqual({
      facts: {
        domain: 'shop.example',
        txt: [
          { name: 'shop.example', outcome: 'failed', records: [] },
          { name: '_dmarc.shop.example', outcome: 'failed', records: [] },
        ],
      },
      notice: 'dns-unchecked',
    })
    // A resolver that answers only when its signal ends the lookup, as c-ares's does.
    const slow: Resolver = Object.assign(() => Promise.resolve([]), {
      txt: (_name: string, signal: AbortSignal) =>
        new Promise<TxtAnswer>((resolve) => {
          signal.addEventListener(
            'abort',
            () => {
              resolve({ outcome: 'failed', records: [] })
            },
            { once: true },
          )
        }),
    })
    const started = Date.now()
    const cancelled = await lookupDns(
      'https://shop.example/',
      [spfLike],
      context(slow, { signal: AbortSignal.timeout(50) }),
    )
    expect(cancelled?.notice).toBe('dns-unchecked')
    expect(Date.now() - started).toBeLessThan(2_000)
  })
})

describe('scan: DNS records', () => {
  let site: TempSite | undefined

  afterEach(async () => {
    await site?.close()
    site = undefined
  })

  const PAGE = '<!doctype html><html lang="ar" dir="rtl"><title>متجر</title><p>نص</p></html>'

  it("gives each rule the lookups, and asks the site's resolver for its names alone", async () => {
    site = await tempSite({
      'index.html': PAGE,
      'site.json': JSON.stringify({
        host: 'www.shop.example',
        aliases: ['shop.example'],
        txt: { 'shop.example': ['v=spf1 include:_spf.example.net ~all'] },
      }),
    })
    const fixture = resolverFor(site)
    const asked: string[] = []
    const resolver = Object.assign(
      (hostname: string, signal: AbortSignal) => {
        asked.push(`${hostname} A/AAAA`)
        return fixture(hostname, signal)
      },
      {
        txt: (name: string, signal: AbortSignal) => {
          asked.push(`${name} TXT`)
          return (
            fixture.txt?.(name, signal) ??
            Promise.resolve<TxtAnswer>({ outcome: 'none', records: [] })
          )
        },
      },
    )
    const report = await scan(site.url('/'), {
      rules: [spfLike, dmarcLike],
      policy: policyFor(site),
      resolver,
    })
    expect(schemaErrors(report)).toBe('')
    expect(report.scan).toMatchObject({ status: 'complete', notices: [] })
    expect(report.rules.map((rule) => [rule.id, rule.status])).toEqual([
      ['apex-rule', 'fail'],
      ['dmarc-rule', 'pass'],
    ])
    expect(report.findings.map((finding) => finding.evidence.values)).toEqual([
      { what: 'v=spf1 include:_spf.example.net ~all' },
    ])
    expect(asked.filter((entry) => entry.endsWith(' TXT')).sort()).toEqual([
      '_dmarc.shop.example TXT',
      'shop.example TXT',
    ])
    expect(new Set(asked.filter((entry) => !entry.endsWith(' TXT')))).toEqual(
      new Set(['www.shop.example A/AAAA']),
    )
  })

  it('reports an error, never a result, for a rule whose lookup got no answer', async () => {
    site = await tempSite({
      'index.html': PAGE,
      'site.json': JSON.stringify({ host: 'shop.example' }),
    })
    const fixture = resolverFor(site)
    const resolver = Object.assign(
      (hostname: string, signal: AbortSignal) => fixture(hostname, signal),
      {
        txt: (name: string, signal: AbortSignal) =>
          name.startsWith('_dmarc.')
            ? Promise.resolve<TxtAnswer>({ outcome: 'failed', records: [] })
            : (fixture.txt?.(name, signal) ??
              Promise.resolve<TxtAnswer>({ outcome: 'none', records: [] })),
      },
    )
    const report = await scan(site.url('/'), {
      rules: [spfLike, dmarcLike],
      policy: policyFor(site),
      resolver,
    })
    expect(report.rules.map((rule) => [rule.id, rule.status, rule.error])).toEqual([
      ['apex-rule', 'fail', undefined],
      ['dmarc-rule', 'error', 'dns-unchecked'],
    ])
    expect(report.scan.status).toBe('partial')
    expect(report.scan.notices.map((notice) => notice.code)).toEqual(['dns-unchecked'])
    expect(report.scan.notices[0]?.message.en).toContain('shop.example')
  })

  it('asks nothing for a page on an address, and its rules do not apply', async () => {
    site = await tempSite({ 'index.html': PAGE })
    const asked: string[] = []
    const report = await scan(site.url('/'), {
      rules: [spfLike, dmarcLike],
      policy: policyFor(site),
      resolver: Object.assign(() => Promise.resolve([]), {
        txt: (name: string) => {
          asked.push(name)
          return Promise.resolve<TxtAnswer>({ outcome: 'none', records: [] })
        },
      }),
    })
    expect(report.rules.map((rule) => rule.status)).toEqual(['not-applicable', 'not-applicable'])
    expect(report.scan.notices).toEqual([])
    expect(asked).toEqual([])
  })
})

describe('evaluatePage: DNS records', () => {
  it('gives the rules the lookups it is handed, and without them they do not apply', () => {
    const page = collectPage({
      url: 'https://shop.example/',
      status: 200,
      headers: [['content-type', 'text/html; charset=utf-8']],
      body: new TextEncoder().encode('<p>نص</p>'),
    })
    const rules = [spfLike, dmarcLike]
    expect(evaluatePage(page, { rules }).results.map((result) => result.status)).toEqual([
      'not-applicable',
      'not-applicable',
    ])
    const dns = {
      domain: 'shop.example',
      txt: [
        { name: 'shop.example', outcome: 'none' as const, records: [] },
        { name: '_dmarc.shop.example', outcome: 'found' as const, records: ['v=DMARC1; p=none'] },
      ],
    }
    expect(evaluatePage(page, { rules, dns }).results.map((result) => result.status)).toEqual([
      'pass',
      'fail',
    ])
  })
})

import { collectPage } from '@arablyzer/collectors'
import {
  createPolicy,
  DEFAULT_POLICY,
  type Resolver,
  type TxtAnswer,
  type TxtResolver,
} from '@arablyzer/egress'
import { serveDoh } from '@arablyzer/fixtures'
import type { Rule } from '@arablyzer/rules'
import { afterEach, describe, expect, it } from 'vitest'
import { lookupDns, txtResolverFor } from '../src/dns'
import { evaluatePage, scan, USER_AGENT } from '../src/index'
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

interface LoggedTxt {
  readonly asked: string[]
  readonly txt: TxtResolver
}

/** A TXT resolver that answers every lookup with `answer`, and logs every name asked of it. */
function loggedTxt(answer: (name: string) => Promise<TxtAnswer>): LoggedTxt {
  const asked: string[] = []
  return {
    asked,
    txt: (name) => {
      asked.push(`${name} TXT`)
      return answer(name)
    },
  }
}

/** A resolver with TXT lookups that also logs the A and AAAA names it is asked. */
function loggedResolver(answer: (name: string) => Promise<TxtAnswer>): Resolver & LoggedTxt {
  const logged = loggedTxt(answer)
  return Object.assign((hostname: string) => {
    logged.asked.push(`${hostname} A/AAAA`)
    return Promise.resolve([])
  }, logged)
}

const found = (records: string[]) => () => Promise.resolve<TxtAnswer>({ outcome: 'found', records })

describe('lookupDns', () => {
  const context = (txt: TxtResolver, overrides = {}) => ({
    txt,
    privateAccess: false,
    ...overrides,
  })

  it("asks for each name the rules read, TXT alone, under the page's organizational domain", async () => {
    const resolver = loggedTxt(found(['v=spf1 -all']))
    const lookup = await lookupDns(
      'https://www.shop.example.com.sa/ar/',
      [spfLike, dmarcLike, spfLike],
      context(resolver.txt),
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
    const resolver = loggedTxt(found([]))
    const html = testRule({ detect: () => [] })
    expect(await lookupDns('https://shop.example/', [html], context(resolver.txt))).toBeUndefined()
    for (const url of [
      'http://127.0.0.1:8080/',
      'http://[::1]/',
      'http://localhost:4321/',
      'http://shop.test/',
      'https://github.io/',
    ]) {
      expect(await lookupDns(url, [spfLike], context(resolver.txt)), url).toBeUndefined()
    }
    // A public name on a private address, under --allow-private: a local build.
    expect(
      await lookupDns(
        'https://shop.example/',
        [spfLike],
        context(resolver.txt, { privateAccess: true }),
      ),
    ).toBeUndefined()
    expect(resolver.asked).toEqual([])
  })

  it('says a lookup got no answer, whether it failed, threw or ran out of time', async () => {
    const failing = loggedTxt((name) =>
      name.startsWith('_dmarc.')
        ? Promise.reject(new Error('a resolver that throws'))
        : Promise.resolve({ outcome: 'failed', records: [] }),
    )
    expect(
      await lookupDns('https://shop.example/', [spfLike, dmarcLike], context(failing.txt)),
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
    const slow: TxtResolver = (_name, signal) =>
      new Promise<TxtAnswer>((resolve) => {
        signal.addEventListener(
          'abort',
          () => {
            resolve({ outcome: 'failed', records: [] })
          },
          { once: true },
        )
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

// M2.3c review: behind the egress proxy a scan resolves no name of its own, so its TXT lookups
// went nowhere, every free audit was partial, and email-security could never answer. They are now
// asked over HTTPS (RFC 8484), through the proxy like all scan traffic.
describe('txtResolverFor', () => {
  const plain: Resolver = () => Promise.resolve([])
  const never = new AbortController().signal

  it('asks over HTTPS when a DoH resolver is named, under the scan’s policy, TXT alone', async () => {
    const doh = await serveDoh({ 'shop.example': { txt: ['v=spf1 -all'] } })
    try {
      const resolver = loggedResolver(found(['from the scan’s own resolver']))
      const txt = txtResolverFor({
        policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: doh.port }] }),
        resolver,
        userAgent: USER_AGENT,
        dohUrl: doh.url,
      })
      expect(await txt?.('shop.example', never)).toEqual({
        outcome: 'found',
        records: ['v=spf1 -all'],
      })
      expect(doh.questions).toEqual(['shop.example TXT'])
      expect(doh.requests.map((request) => request.userAgent)).toEqual([USER_AGENT])
      expect(resolver.asked).toEqual([])
    } finally {
      await doh.close()
    }
  })

  it('asks over HTTPS behind an egress proxy too, which is what it is for', () => {
    const behind = createPolicy({ upstream: 'http://127.0.0.1:9' })
    const resolver = loggedResolver(found([]))
    const txt = txtResolverFor({
      policy: behind,
      resolver,
      userAgent: USER_AGENT,
      dohUrl: 'https://cloudflare-dns.com/dns-query',
    })
    expect(txt).toBeTypeOf('function')
    expect(txt).not.toBe(resolver.txt)
  })

  it('asks the scan’s own resolver where the process asks DNS itself', () => {
    const resolver = loggedResolver(found([]))
    expect(txtResolverFor({ policy: DEFAULT_POLICY, resolver, userAgent: USER_AGENT })).toBe(
      resolver.txt,
    )
  })

  it('has no way behind an egress proxy without a DoH resolver, or with a resolver without TXT lookups', () => {
    const behind = createPolicy({ upstream: 'http://127.0.0.1:9' })
    const resolver = loggedResolver(found([]))
    expect(txtResolverFor({ policy: behind, resolver, userAgent: USER_AGENT })).toBeUndefined()
    expect(
      txtResolverFor({ policy: DEFAULT_POLICY, resolver: plain, userAgent: USER_AGENT }),
    ).toBeUndefined()
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

  // The hosted scanner's case: a policy with an egress proxy, and a resolver of no use for TXT.
  it('asks a DoH resolver, and the scan’s own none, when the scan is given one', async () => {
    site = await tempSite({
      'index.html': PAGE,
      'site.json': JSON.stringify({
        host: 'www.shop.example',
        aliases: ['shop.example'],
        txt: { 'shop.example': ['v=spf1 include:_spf.example.net ~all'] },
      }),
    })
    const files = site
    const doh = await serveDoh((name) => {
      const answer = files.txt(name)
      return { txt: answer.records }
    })
    try {
      // No TXT lookup of its own: this resolver could not answer the rules at all.
      const names: string[] = []
      const fixture = resolverFor(site)
      const resolver: Resolver = (hostname, signal) => {
        names.push(hostname)
        return fixture(hostname, signal)
      }
      const report = await scan(site.url('/'), {
        rules: [spfLike, dmarcLike],
        policy: createPolicy({
          allowTargets: [
            { address: '127.0.0.1', port: site.port },
            { address: '127.0.0.1', port: doh.port },
          ],
        }),
        resolver,
        dohUrl: doh.url,
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
      expect([...doh.questions].sort()).toEqual(['_dmarc.shop.example TXT', 'shop.example TXT'])
      for (const request of doh.requests) {
        expect(request.method).toBe('GET')
        expect(request.userAgent).toBe(USER_AGENT)
      }
      // The names the scan resolves itself are the page's alone, never the resolver's.
      expect(new Set(names)).toEqual(new Set(['www.shop.example']))
    } finally {
      await doh.close()
    }
  })

  it('reports an error, never a result, when the DoH resolver gives no answer', async () => {
    site = await tempSite({
      'index.html': PAGE,
      'site.json': JSON.stringify({ host: 'shop.example' }),
    })
    const doh = await serveDoh({}, { status: 503 })
    try {
      const report = await scan(site.url('/'), {
        rules: [spfLike, dmarcLike],
        policy: createPolicy({
          allowTargets: [
            { address: '127.0.0.1', port: site.port },
            { address: '127.0.0.1', port: doh.port },
          ],
        }),
        resolver: resolverFor(site),
        dohUrl: doh.url,
      })
      expect(report.rules.map((rule) => [rule.id, rule.status, rule.error])).toEqual([
        ['apex-rule', 'error', 'dns-unchecked'],
        ['dmarc-rule', 'error', 'dns-unchecked'],
      ])
      expect(report.scan.status).toBe('partial')
      expect(report.scan.notices.map((notice) => notice.code)).toEqual(['dns-unchecked'])
    } finally {
      await doh.close()
    }
  })

  // M2.3c review: a scan with no way to ask DNS answered every DNS rule with an error, so every
  // free audit came out partial. It leaves the rules out instead, as it does rules that need a
  // browser when it renders none.
  it('leaves the DNS rules out, with a notice, when it has no way to ask DNS', async () => {
    site = await tempSite({
      'index.html': PAGE,
      'site.json': JSON.stringify({ host: 'shop.example' }),
    })
    const fixture = resolverFor(site)
    // A resolver of A and AAAA alone, and no DoH resolver.
    const plain: Resolver = (hostname, signal) => fixture(hostname, signal)
    const other = testRule({ id: 'other-rule', detect: () => [] })
    const report = await scan(site.url('/'), {
      rules: [spfLike, dmarcLike, other],
      policy: policyFor(site),
      resolver: plain,
    })
    expect(schemaErrors(report)).toBe('')
    expect(report.rules.map((rule) => [rule.id, rule.status])).toEqual([['other-rule', 'pass']])
    expect(report.scan.status).toBe('complete')
    expect(report.scan.notices.map((notice) => notice.code)).toEqual(['dns-unavailable'])
    expect(report.scan.notices[0]?.message.en).toBe(
      'This scan has no way to look up DNS records, so the checks that read the domain’s DNS records did not run.',
    )
    // Asked for by name, such a rule is refused, as one that needs a browser is.
    await expect(
      scan(site.url('/'), {
        rules: [spfLike, other],
        ruleIds: ['apex-rule'],
        policy: policyFor(site),
        resolver: plain,
      }),
    ).rejects.toThrow(/need DNS records.*apex-rule/)
    // A scan that needs none says nothing of it.
    const quiet = await scan(site.url('/'), {
      rules: [other],
      policy: policyFor(site),
      resolver: plain,
    })
    expect(quiet.scan.notices).toEqual([])
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

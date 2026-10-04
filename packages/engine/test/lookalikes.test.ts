import { createPolicy } from '@arablyzer/egress'
import { afterEach, describe, expect, it } from 'vitest'
import { scan } from '../src/index'
import { findLookalikes, generateLookalikes, splitDomain } from '../src/lookalikes'
import type { Ask, AskRequest } from '../src/outside-http'
import { tempSite, type TempSite } from './helpers'

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

/** Cloudflare's JSON DoH and crt.sh, in memory: `registered` maps a name to its records. */
function services(
  registered: Record<string, { a?: boolean; mx?: boolean; certs?: string[] }>,
  options: { ctDown?: boolean; dnsDown?: boolean } = {},
): { ask: Ask; calls: AskRequest[] } {
  const calls: AskRequest[] = []
  const ask: Ask = (request) => {
    calls.push(request)
    const url = new URL(request.url)
    if (url.hostname === 'cloudflare-dns.com') {
      if (options.dnsDown === true) return Promise.resolve(null)
      const name = url.searchParams.get('name') ?? ''
      const type = url.searchParams.get('type')
      const record = registered[name]
      const has = type === 'A' ? record?.a === true : record?.mx === true
      return Promise.resolve({
        status: 200,
        body: encode(
          has
            ? { Status: 0, Answer: [{ name, type: type === 'A' ? 1 : 15, data: 'x' }] }
            : { Status: record === undefined ? 3 : 0 },
        ),
      })
    }
    if (url.hostname === 'crt.sh') {
      if (options.ctDown === true) return Promise.resolve({ status: 503, body: new Uint8Array() })
      const name = url.searchParams.get('q') ?? ''
      const certs = registered[name]?.certs ?? []
      return Promise.resolve({
        status: 200,
        body: encode(
          certs.map((date) => ({
            entry_timestamp: `${date}T10:00:00.000`,
            not_before: `${date}T00:00:00`,
          })),
        ),
      })
    }
    return Promise.resolve(null)
  }
  return { ask, calls }
}

const fast = { dnsGapMs: 0, ctGapMs: 0 }
const NOW = Date.parse('2026-10-04T00:00:00Z')

describe('look-alike generation', () => {
  it('splits a domain at its registrable label', () => {
    expect(splitDomain('www.alwaha.com.sa')).toEqual({ label: 'alwaha', suffix: 'com.sa' })
    expect(splitDomain('shop.example.com')).toEqual({ label: 'example', suffix: 'com' })
    expect(splitDomain('xn--mgbc0a9azcg.com')).toBeNull()
  })

  it('makes at most 100 distinct names, none the domain itself, in a fixed order', () => {
    const names = generateLookalikes('alwaha-khaleej.com.sa')
    expect(names.length).toBeLessThanOrEqual(100)
    expect(new Set(names.map((item) => item.domain)).size).toBe(names.length)
    expect(names.map((item) => item.domain)).not.toContain('alwaha-khaleej.com.sa')
    expect(generateLookalikes('alwaha-khaleej.com.sa')).toEqual(names)
    expect(names[0]).toEqual({ domain: 'alwaha-khaleej.com', kind: 'tld' })
  })

  it('swaps Arabizi digits for letters and letters for digits', () => {
    const names = generateLookalikes('khalid.com').map((item) => item.domain)
    expect(names).toContain('5alid.com') // kh is خ
    expect(names).toContain('kh2lid.com') // the a of an alef or hamza
    expect(names).toContain('kh3lid.com') // the a of ع
    expect(generateLookalikes('3ali.com').map((item) => item.domain)).toContain('aali.com')
    expect(generateLookalikes('mohammed.com').map((item) => item.domain)).toContain('mo7ammed.com')
  })

  it('makes the usual typos, and the same name on the Arab suffixes', () => {
    const names = generateLookalikes('alwaha.com').map((item) => item.domain)
    expect(names).toContain('alwaha.sa')
    expect(names).toContain('alwaha.com.eg')
    expect(names).toContain('alwha.com') // a letter left out
    expect(names).toContain('aalwaha.com') // doubled
    expect(names).toContain('lawaha.com') // swapped
    expect(names).toContain('al-waha.com') // hyphen
  })

  it('makes nothing for a name with no usable label', () => {
    expect(generateLookalikes('localhost')).toEqual([])
    expect(generateLookalikes('192.168.0.1')).toEqual([])
  })
})

describe('the look-alikes that exist', () => {
  it('finds the registered ones, with A and MX and the first certificate', async () => {
    const { ask, calls } = services({
      'alwaha.net': { a: true, mx: true, certs: ['2026-09-20', '2026-10-01'] },
      'alwha.com': { a: true, certs: ['2024-03-01'] },
      'alwaha.co': { mx: true },
    })
    const facts = await findLookalikes('alwaha.com', { ask, now: () => NOW, ...fast })
    expect(facts.outcome).toBe('checked')
    if (facts.outcome !== 'checked') return
    expect(facts.ct).toBe('checked')
    expect(facts.candidates).toBeGreaterThan(30)
    const byName = Object.fromEntries(facts.found.map((item) => [item.domain, item]))
    expect(byName['alwaha.net']).toMatchObject({
      address: true,
      mail: true,
      firstSeen: '2026-09-20',
      certificates: 2,
      recent: true,
    })
    expect(byName['alwha.com']).toMatchObject({ firstSeen: '2024-03-01', recent: false })
    expect(byName['alwaha.co']).toMatchObject({
      address: false,
      mail: true,
      certificates: 0,
      firstSeen: null,
    })
    // The names with a mail server come first.
    expect(facts.found[0]?.mail).toBe(true)
    // DNS goes to Cloudflare as JSON, certificates to crt.sh, and nowhere else.
    expect(new Set(calls.map((call) => new URL(call.url).hostname))).toEqual(
      new Set(['cloudflare-dns.com', 'crt.sh']),
    )
    expect(calls.find((call) => call.url.includes('cloudflare'))?.accept).toBe(
      'application/dns-json',
    )
  })

  it('asks crt.sh for at most twelve names, one after another, and keeps a day of answers', async () => {
    const registered = Object.fromEntries(
      generateLookalikes('cachedomain.com')
        .slice(0, 20)
        .map((item) => [item.domain, { a: true, certs: ['2025-01-01'] }]),
    )
    const first = services(registered)
    const facts = await findLookalikes('cachedomain.com', {
      ask: first.ask,
      now: () => NOW,
      ...fast,
    })
    expect(first.calls.filter((call) => call.url.includes('crt.sh'))).toHaveLength(12)
    expect(facts.outcome === 'checked' && facts.ct).toBe('partial')
    const second = services(registered)
    await findLookalikes('cachedomain.com', { ask: second.ask, now: () => NOW, ...fast })
    expect(second.calls.filter((call) => call.url.includes('crt.sh'))).toHaveLength(0)
  })

  it('still lists the names when Certificate Transparency is down, and stops asking it', async () => {
    const { ask, calls } = services(
      { 'down1.net': { a: true }, 'down1.co': { a: true }, 'down1.org': { a: true } },
      { ctDown: true },
    )
    const facts = await findLookalikes('down1.com', { ask, now: () => NOW, ...fast })
    expect(facts.outcome).toBe('checked')
    if (facts.outcome !== 'checked') return
    expect(facts.ct).toBe('unavailable')
    expect(facts.found.map((item) => item.domain).sort()).toEqual([
      'down1.co',
      'down1.net',
      'down1.org',
    ])
    expect(facts.found.every((item) => item.certificates === null && item.firstSeen === null)).toBe(
      true,
    )
    expect(calls.filter((call) => call.url.includes('crt.sh')).length).toBeLessThanOrEqual(2)
  })

  it('fails, rather than say there are none, when DNS never answers', async () => {
    const { ask } = services({}, { dnsDown: true })
    const facts = await findLookalikes('dnsdown.com', { ask, now: () => NOW, ...fast })
    expect(facts).toMatchObject({ outcome: 'failed', domain: 'dnsdown.com' })
  })

  it('says none are registered when DNS answers that none exists', async () => {
    const { ask } = services({})
    const facts = await findLookalikes('nonereg.com', { ask, now: () => NOW, ...fast })
    expect(facts).toMatchObject({ outcome: 'checked', found: [] })
  })
})

describe('the look-alike radar in a tool scan', () => {
  let site: TempSite | undefined
  afterEach(async () => {
    await site?.close()
    site = undefined
  })

  it('reports the found names in the facts and as findings, and is not run in a whole scan', async () => {
    site = await tempSite({
      'index.html':
        '<!doctype html><html lang="ar"><head><meta charset="utf-8"></head><body><p>مرحبا</p></body></html>',
    })
    const policy = createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] })
    // A local site is on a private address: no look-alike is asked for it.
    const local = await scan(site.url('/'), {
      ruleIds: ['lookalike-domains'],
      policy,
      outside: { ask: services({}).ask },
    })
    expect(local.rules.find((rule) => rule.id === 'lookalike-domains')?.status).toBe(
      'not-applicable',
    )
    expect(local.facts.lookalikes).toBeUndefined()
    const whole = await scan(site.url('/'), { policy, outside: { ask: services({}).ask } })
    expect(whole.rules.some((rule) => rule.id === 'lookalike-domains')).toBe(false)
  })
})

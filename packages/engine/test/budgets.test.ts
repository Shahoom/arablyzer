import { collectPage } from '@arablyzer/collectors'
import type { TxtAnswer, TxtResolver } from '@arablyzer/egress'
import * as egress from '@arablyzer/egress'
import type { Rule } from '@arablyzer/rules'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DNS_TIMEOUT_MS, lookupDns } from '../src/dns'
import { checkLinks, CONCURRENCY, LINK_TIMEOUT_MS, LINKS_TIMEOUT_MS } from '../src/links'
import { policyFor, tempSite, testRule, type TempSite } from './helpers'

// M2.3c review: the link checks and the DNS lookups have budgets: a request, all the checks, how
// many at once, and how long DNS may take. Each is tested with the constant the code uses, so a
// budget that is never applied fails here. The network is a local fixture site that answers no
// HEAD; the clock is fake for the two limits too long to wait for.

vi.mock('@arablyzer/egress', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arablyzer/egress')>()
  return { ...actual, safeFetch: vi.fn(actual.safeFetch) }
})

const page = (links: string) =>
  `<!doctype html><html lang="ar" dir="rtl"><title>متجر</title><body>${links}</body></html>`

let site: TempSite | undefined
afterEach(async () => {
  vi.useRealTimers()
  vi.mocked(egress.safeFetch).mockClear()
  await site?.close()
  site = undefined
})

/**
 * A site whose pages /p/0… /p/<count - 1> never answer a HEAD, and the facts of the page that
 * links to them.
 */
async function quiet(count: number) {
  const paths = Array.from({ length: count }, (_, index) => `/p/${String(index)}`)
  const html = page(paths.map((path) => `<a href="${path}">x</a>`).join(''))
  const local = await tempSite(
    { 'index.html': html },
    Object.fromEntries(paths.map((path) => [path, { headDrop: 'silence' as const }])),
  )
  site = local
  const facts = collectPage({
    url: local.url('/'),
    status: 200,
    headers: [['content-type', 'text/html; charset=utf-8']],
    body: new TextEncoder().encode(html),
  })
  return { local, facts }
}

/** Lets the network work, in the real loop: setImmediate is not faked. */
async function until(condition: () => boolean, ms = 3_000): Promise<void> {
  const started = performance.now()
  while (!condition()) {
    if (performance.now() - started > ms) throw new Error('The condition never held')
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })
  }
}

const heads = (local: TempSite) => local.requests.filter((request) => request.startsWith('HEAD '))

describe('the link checks’ budgets', () => {
  const options = { userAgent: 'ArablyzerBot/1.0' }

  it('ask at most CONCURRENCY requests at once', async () => {
    const { local, facts: linked } = await quiet(12)
    const controller = new AbortController()
    const checking = checkLinks(linked, {
      base: { ...options, policy: policyFor(local), timeoutMs: 5_000, signal: controller.signal },
      optedOut: () => false,
    })
    await until(() => heads(local).length >= CONCURRENCY)
    // No fifth request while the four wait: the workers are busy.
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(heads(local)).toHaveLength(CONCURRENCY)
    controller.abort()
    const facts = await checking
    expect(facts.checks).toHaveLength(12)
    expect(facts.checks.every((check) => check.outcome === 'unanswered')).toBe(true)
  })

  it('give each request LINK_TIMEOUT_MS at most, whatever the page’s own limit', async () => {
    const { local, facts: linked } = await quiet(1)
    const ask = (timeoutMs: number | undefined) =>
      checkLinks(linked, {
        base: {
          ...options,
          policy: policyFor(local),
          // The first request is timed out by the test's own signal: only the option is read.
          signal: AbortSignal.timeout(100),
          ...(timeoutMs === undefined ? {} : { timeoutMs }),
        },
        optedOut: () => false,
      })
    const timeouts = async (timeoutMs: number | undefined) => {
      vi.mocked(egress.safeFetch).mockClear()
      await ask(timeoutMs)
      return vi.mocked(egress.safeFetch).mock.calls.map(([, given]) => given.timeoutMs)
    }
    expect((await timeouts(undefined)).every((each) => each === LINK_TIMEOUT_MS)).toBe(true)
    expect((await timeouts(30_000)).every((each) => each === LINK_TIMEOUT_MS)).toBe(true)
    expect((await timeouts(2_000)).every((each) => each === 2_000)).toBe(true)
    expect(vi.mocked(egress.safeFetch).mock.calls.length).toBeGreaterThan(0)
  })

  it('end a request that never answers at its own limit, and go on with the others', async () => {
    const { local, facts: linked } = await quiet(6)
    const started = Date.now()
    const facts = await checkLinks(linked, {
      base: { ...options, policy: policyFor(local), timeoutMs: 300 },
      optedOut: () => false,
    })
    // Six links, four at once, 300 ms each: two waves.
    expect(Date.now() - started).toBeLessThan(3_000)
    expect(facts.checks.slice(0, 6).map((check) => check.outcome)).toEqual(
      Array.from({ length: 6 }, () => 'unanswered'),
    )
    expect(
      facts.checks
        .slice(0, 6)
        .every((check) => check.outcome === 'unanswered' && check.reason === 'timeout'),
    ).toBe(true)
  })

  it('stop at LINKS_TIMEOUT_MS in all: what is asked is not judged, what is not asked is out of time', async () => {
    const { local, facts: linked } = await quiet(6)
    // Only the checks' own clock is faked; the sockets are real.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let done = false
    const checking = checkLinks(linked, {
      base: { ...options, policy: policyFor(local) },
      optedOut: () => false,
    }).then((facts) => {
      done = true
      return facts
    })
    await until(() => heads(local).length >= CONCURRENCY)
    await vi.advanceTimersByTimeAsync(LINKS_TIMEOUT_MS - 1)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const facts = await checking
    expect(done).toBe(true)
    // The four in flight and the two never asked: none is judged.
    expect(facts.checks.map((check) => check.outcome)).toEqual(
      Array.from({ length: facts.checks.length }, () => 'unanswered'),
    )
    expect(
      facts.checks.every(
        (check) => check.outcome === 'unanswered' && check.reason === 'out-of-time',
      ),
    ).toBe(true)
    // No request went out after the time ran out.
    expect(heads(local)).toHaveLength(CONCURRENCY)
  }, 15_000)
})

describe('the DNS lookups’ budget', () => {
  const spf: Rule = {
    ...testRule({ id: 'apex-rule', needs: ['dns'], detect: () => [] }),
    txtName: (domain) => domain,
  }
  const never: TxtResolver = (_name, signal) =>
    new Promise<TxtAnswer>((resolve) => {
      signal.addEventListener(
        'abort',
        () => {
          resolve({ outcome: 'failed', records: [] })
        },
        { once: true },
      )
    })

  it('gives up at DNS_TIMEOUT_MS in all, and says the lookup got no answer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let done = false
    const lookup = lookupDns('https://shop.example/', [spf], {
      txt: never,
      privateAccess: false,
    }).then((found) => {
      done = true
      return found
    })
    await vi.advanceTimersByTimeAsync(DNS_TIMEOUT_MS - 1)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const found = await lookup
    expect(done).toBe(true)
    expect(found).toEqual({
      facts: {
        domain: 'shop.example',
        txt: [{ name: 'shop.example', outcome: 'failed', records: [] }],
      },
      notice: 'dns-unchecked',
    })
  }, 15_000)

  it('leaves no timer behind when the lookups end sooner', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const answered: TxtResolver = () => Promise.resolve({ outcome: 'none', records: [] })
    await lookupDns('https://shop.example/', [spf], { txt: answered, privateAccess: false })
    expect(vi.getTimerCount()).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'
import { MemorySotawStore, type SotawStore } from '../src/store'
import { isIncompleteChain, markIncompleteChains, type TlsFailure } from '../src/tls-check'

const RUN = 'sotaw-test'
const CHAIN: TlsFailure = {
  code: 'tls-failed',
  message: 'TLS failed: UNABLE_TO_VERIFY_LEAF_SIGNATURE',
}

async function harness(
  sites: Record<string, 'robots-unreachable' | 'robots' | 'done'>,
  answers: Record<string, TlsFailure | null>,
  load: () => number = () => 0.1,
) {
  const store: SotawStore = new MemorySotawStore()
  const domains = Object.keys(sites)
  await store.start(
    { id: RUN, frameId: 'T', frameSha: 'f'.repeat(64), seed: 'seed' },
    domains.map((domain, position) => ({ domain, country: 'dz', rank: position + 1, position })),
    new Date(0),
  )
  for (const domain of domains) {
    const end = sites[domain]
    await store.claim(RUN, new Date(0))
    if (end !== undefined && end !== 'done') await store.skip(RUN, domain, end, new Date(0))
  }
  const asked: string[] = []
  const slept: number[] = []
  const check = () =>
    markIncompleteChains(RUN, {
      store,
      read: (url) => {
        asked.push(url)
        return Promise.resolve(answers[url] ?? { code: 'connect-failed', message: 'ECONNREFUSED' })
      },
      load,
      sleep: (ms) => {
        slept.push(ms)
        return Promise.resolve()
      },
      now: () => 0,
      log: () => undefined,
      maxLoad: 0.5,
      pollMs: 5_000,
      paceMs: 2_000,
    })
  return { store, asked, slept, check }
}

describe('what an incomplete certificate chain is', () => {
  it('names the failures of a certificate that does not reach a root', () => {
    expect(isIncompleteChain(CHAIN)).toBe(true)
    expect(
      isIncompleteChain({
        code: 'tls-failed',
        message: 'TLS failed: UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
      }),
    ).toBe(true)
  })

  it('does not take any other failure for one', () => {
    for (const message of [
      'TLS failed: CERT_HAS_EXPIRED',
      'TLS failed: DEPTH_ZERO_SELF_SIGNED_CERT',
      'TLS failed: HOSTNAME_MISMATCH',
    ]) {
      expect(isIncompleteChain({ code: 'tls-failed', message }), message).toBe(false)
    }
    expect(isIncompleteChain({ code: 'timeout', message: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' })).toBe(
      false,
    )
    expect(isIncompleteChain(null)).toBe(false)
  })
})

describe('marking the sites that could not be read for an incomplete chain', () => {
  it('moves them to their own reason, on the bare name or on www, and leaves the rest', async () => {
    const h = await harness(
      {
        'bare.dz': 'robots-unreachable',
        'www.dz': 'robots-unreachable',
        'expired.dz': 'robots-unreachable',
        'down.dz': 'robots-unreachable',
      },
      {
        'https://bare.dz/robots.txt': CHAIN,
        'https://www.www.dz/robots.txt': CHAIN,
        'https://expired.dz/robots.txt': {
          code: 'tls-failed',
          message: 'TLS failed: CERT_HAS_EXPIRED',
        },
      },
    )
    expect(await h.check()).toEqual({ checked: 4, marked: 2 })
    expect((await h.store.results(RUN)).map((r) => [r.state, r.reason])).toEqual([
      ['skipped', 'tls-chain'],
      ['skipped', 'tls-chain'],
      ['skipped', 'robots-unreachable'],
      ['skipped', 'robots-unreachable'],
    ])
  })

  it('reads only robots.txt of the sites left unread, and no further once one is named', async () => {
    const h = await harness(
      { 'a.dz': 'robots-unreachable', 'b.dz': 'robots', 'c.dz': 'done' },
      { 'https://a.dz/robots.txt': CHAIN },
    )
    await h.check()
    expect(h.asked).toEqual(['https://a.dz/robots.txt'])
  })

  it('finds nothing more to do the second time', async () => {
    const h = await harness({ 'a.dz': 'robots-unreachable' }, { 'https://a.dz/robots.txt': CHAIN })
    await h.check()
    expect(await h.check()).toEqual({ checked: 0, marked: 0 })
  })

  it('waits while the host is busy, and keeps its pace between reads', async () => {
    let loads = [0.9, 0.9, 0.1]
    const h = await harness({ 'a.dz': 'robots-unreachable' }, {}, () => {
      const next = loads[0] ?? 0.1
      loads = loads.slice(1)
      return next
    })
    await h.check()
    expect(h.asked).toEqual(['https://a.dz/robots.txt', 'https://www.a.dz/robots.txt'])
    expect(h.slept).toEqual([5_000, 5_000, 2_000, 2_000])
  })
})

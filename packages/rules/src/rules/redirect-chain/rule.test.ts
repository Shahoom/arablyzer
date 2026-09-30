import type { Redirect } from '@arablyzer/report-schema'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const reached = (url: string, ...redirects: Redirect[]) => ({
  page: htmlPage('<p>نص</p>', { url }),
  redirects,
})

describe('redirect-chain', () => {
  it('fires on a page reached through two redirects', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong'))).toEqual([
      {
        message: 'chain',
        values: { count: 2, from: 'http://fixture.test/', to: 'http://fixture.test/ar/' },
        url: 'http://fixture.test/',
        snippet: '301 http://fixture.test/ → 301 http://fixture.test/ar → http://fixture.test/ar/',
      },
    ])
  })

  it('passes a page reached through one redirect', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(evidence.redirects).toEqual([{ url: 'http://fixture.test/', status: 301 }])
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('counts every kind of redirect, across names and paths', () => {
    const findings = detectAll(
      rule,
      reached(
        'https://www.example.com/ar/',
        { url: 'https://example.com/', status: 302 },
        { url: 'https://www.example.com/', status: 308 },
      ),
    )
    expect(findings).toMatchObject([
      {
        values: { count: 2, from: 'https://example.com/', to: 'https://www.example.com/ar/' },
        snippet:
          '302 https://example.com/ → 308 https://www.example.com/ → https://www.example.com/ar/',
      },
    ])
  })

  it('does not count a first move to HTTPS on the same name, which HSTS preload asks for', () => {
    // hstspreload.org: redirect from HTTP to HTTPS on the same host, then to the canonical name.
    const preload = reached(
      'https://www.example.com/',
      { url: 'http://example.com/', status: 301 },
      { url: 'https://example.com/', status: 301 },
    )
    expect(detectAll(rule, preload)).toEqual([])
    // One more step after it is a chain again, counted in full.
    const longer = reached(
      'https://www.example.com/ar/',
      { url: 'http://example.com/', status: 301 },
      { url: 'https://example.com/', status: 301 },
      { url: 'https://www.example.com/', status: 301 },
    )
    expect(detectAll(rule, longer)).toMatchObject([{ values: { count: 3 } }])
    // A first step that changes the name too is not that move.
    const renamed = reached(
      'https://www.example.com/ar/',
      { url: 'http://example.com/', status: 301 },
      { url: 'https://www.example.com/', status: 301 },
    )
    expect(detectAll(rule, renamed)).toMatchObject([{ values: { count: 2 } }])
  })

  it('does not apply to a page that answered at once', () => {
    expect(applies(rule, reached('https://example.com/'))).toBe(false)
    expect(applies(rule, { page: htmlPage('<p>نص</p>') })).toBe(false)
    expect(
      applies(rule, reached('https://example.com/', { url: 'http://example.com/', status: 301 })),
    ).toBe(true)
  })
})

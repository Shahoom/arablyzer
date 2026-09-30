import type { Header } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { CHALLENGE_SIGNALS, challengeOf } from '../src/lib/challenges'

const html: Header = ['content-type', 'text/html; charset=UTF-8']

describe('challengeOf', () => {
  it('reads Cloudflare’s cf-mitigated: challenge, on any status', () => {
    expect(challengeOf([html, ['cf-mitigated', 'challenge']])).toEqual({
      service: 'Cloudflare',
      header: 'cf-mitigated',
      value: 'challenge',
    })
    // Header values compare case aside, and a list is read value by value.
    expect(challengeOf([['cf-mitigated', 'Challenge']])).toMatchObject({ value: 'challenge' })
    expect(challengeOf([['cf-mitigated', 'other, challenge']])).toMatchObject({
      service: 'Cloudflare',
    })
  })

  it('reads AWS WAF’s x-amzn-waf-action, for its challenge and its CAPTCHA', () => {
    expect(challengeOf([['x-amzn-waf-action', 'challenge']])).toEqual({
      service: 'AWS WAF',
      header: 'x-amzn-waf-action',
      value: 'challenge',
    })
    expect(challengeOf([['x-amzn-waf-action', 'captcha']])).toMatchObject({ value: 'captcha' })
  })

  it('reads nothing else: another value, another header, or none', () => {
    for (const headers of [
      [html],
      [['cf-mitigated', 'block']],
      [['x-amzn-waf-action', 'block']],
      [['cf-ray', '8f1b2c3d4e5f6a7b-DXB']],
      [['server', 'cloudflare']],
    ] as const) {
      expect(challengeOf(headers), JSON.stringify(headers)).toBeNull()
    }
  })

  it('names where each service documents its signal', () => {
    for (const signal of CHALLENGE_SIGNALS) {
      expect(signal.header).toBe(signal.header.toLowerCase())
      expect(signal.source).toMatch(/^https:\/\/docs?\.|^https:\/\/developers\./)
    }
  })
})

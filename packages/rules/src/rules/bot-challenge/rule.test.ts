import type { Header } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const answer = (status: number, headers: Header[], html = '<p>One moment</p>') =>
  htmlPage(html, {
    status,
    headers: [['content-type', 'text/html; charset=UTF-8'], ...headers],
    url: 'https://shop.example/',
  })

describe('bot-challenge', () => {
  it('reports Cloudflare’s challenge, by the header Cloudflare documents', async () => {
    const wrong = await fixtureEvidence(rule.id, 'wrong')
    expect(applies(rule, wrong)).toBe(true)
    expect(detectAll(rule, wrong)).toEqual([
      {
        message: 'challenge',
        snippet: 'cf-mitigated: challenge',
        values: { service: 'Cloudflare', header: 'cf-mitigated', value: 'challenge', status: 403 },
      },
    ])
  })

  it('reports AWS WAF’s, which answers 202', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong-aws'))).toEqual([
      {
        message: 'challenge',
        snippet: 'x-amzn-waf-action: challenge',
        values: {
          service: 'AWS WAF',
          header: 'x-amzn-waf-action',
          value: 'challenge',
          status: 202,
        },
      },
    ])
    const captcha = { page: answer(405, [['x-amzn-waf-action', 'captcha']]) }
    expect(detectAll(rule, captcha)).toMatchObject([{ values: { value: 'captcha', status: 405 } }])
  })

  it('passes the page itself', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right'))).toEqual([])
  })

  it('guesses nothing: not from a refusal, nor from what the page says', () => {
    const guesses = [
      answer(403, []),
      answer(
        503,
        [['server', 'cloudflare']],
        '<title>Just a moment...</title><p>Checking your browser</p>',
      ),
      answer(429, [['retry-after', '60']]),
      answer(200, [['cf-mitigated', 'block']]),
    ]
    for (const page of guesses) expect(detectAll(rule, { page })).toEqual([])
  })

  it('applies to every answer, a local site’s included', () => {
    expect(applies(rule, { page: answer(403, []) })).toBe(true)
    const local = htmlPage('<p>مرحبا</p>', { url: 'http://localhost:4321/' })
    expect(applies(rule, { page: local })).toBe(true)
  })
})

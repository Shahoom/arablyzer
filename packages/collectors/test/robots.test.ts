import { describe, expect, it } from 'vitest'
import { collectRobots, parseRobotsTxt, type RobotsTxt } from '../src/robots'
import { concat, utf8 } from './helpers'

const parse = (text: string): RobotsTxt => parseRobotsTxt(utf8(text))

/** Groups as [agent tokens, rule shorthands] for compact assertions. */
function shape(robots: RobotsTxt) {
  return robots.groups.map((group) => [
    group.agents.map((agent) => (agent.global ? '*' : agent.product)),
    group.rules.map((rule) => `${rule.type}:${rule.pattern}`),
  ])
}

describe('parseRobotsTxt (RFC 9309)', () => {
  it('groups consecutive user-agent lines and their rules', () => {
    const robots = parse(
      'User-agent: Googlebot\nUser-agent: bingbot\nDisallow: /private/\nAllow: /private/ok\n\nUser-agent: *\nDisallow: /tmp/\n',
    )
    expect(shape(robots)).toEqual([
      [
        ['googlebot', 'bingbot'],
        ['disallow:/private/', 'allow:/private/ok'],
      ],
      [['*'], ['disallow:/tmp/']],
    ])
    expect(robots.groups[0]?.rules[1]).toMatchObject({ text: 'Allow: /private/ok', line: 4 })
  })

  it('starts a new group only when a user-agent line follows a rule', () => {
    const robots = parse(
      'User-agent: a\n\n# comment\nUser-agent: b\nDisallow: /\nUser-agent: c\nAllow: /\n',
    )
    expect(shape(robots)).toEqual([
      [['a', 'b'], ['disallow:/']],
      [['c'], ['allow:/']],
    ])
  })

  it('keeps sitemaps out of groups and ignores rules before any user-agent', () => {
    const robots = parse(
      'Disallow: /orphan\nUser-agent: a\nSitemap: https://example.com/sitemap.xml\nUser-agent: b\nDisallow: /x\n',
    )
    expect(shape(robots)).toEqual([[['a', 'b'], ['disallow:/x']]])
    expect(robots.sitemaps).toEqual(['https://example.com/sitemap.xml'])
  })

  it('strips comments and whitespace; keys are case-insensitive', () => {
    expect(shape(parse('  USER-AGENT :  Googlebot  # the crawler\n DISALLOW:/a # no\n'))).toEqual([
      [['googlebot'], ['disallow:/a']],
    ])
  })

  it('reads CRLF, CR and LF line endings and skips a BOM', () => {
    const body = concat(
      new Uint8Array([0xef, 0xbb, 0xbf]),
      utf8('User-agent: a\r\nDisallow: /1\rDisallow: /2\n'),
    )
    expect(shape(parseRobotsTxt(body))).toEqual([[['a'], ['disallow:/1', 'disallow:/2']]])
  })

  it('accepts the typos and the missing colon that Google accepts', () => {
    const robots = parse(
      'useragent: a\nuser agent: b\ndissallow: /1\ndisalow: /2\nDisallow /3\nDisallow /4 /5\n',
    )
    expect(shape(robots)).toEqual([
      [
        ['a', 'b'],
        ['disallow:/1', 'disallow:/2', 'disallow:/3'],
      ],
    ])
  })

  it('extracts the product token from user-agent values', () => {
    const robots = parse(
      'User-agent: Googlebot/2.1 (+http://www.google.com/bot.html)\nUser-agent: * extra\nDisallow: /\n',
    )
    expect(robots.groups[0]?.agents.map((agent) => [agent.product, agent.global])).toEqual([
      ['googlebot', false],
      ['', true],
    ])
  })

  it('drops empty rules but still ends the group with them', () => {
    const robots = parse('User-agent: a\nDisallow:\nUser-agent: b\nDisallow: /\n')
    expect(shape(robots)).toEqual([
      [['a'], []],
      [['b'], ['disallow:/']],
    ])
  })

  it('percent-encodes non-ASCII paths and upper-cases escapes, like Google', () => {
    const robots = parse('User-agent: *\nDisallow: /منتجات/\nDisallow: /a%2fb\n')
    expect(robots.groups[0]?.rules.map((rule) => [rule.pattern, rule.text])).toEqual([
      ['/%D9%85%D9%86%D8%AA%D8%AC%D8%A7%D8%AA/', 'Disallow: /منتجات/'],
      ['/a%2Fb', 'Disallow: /a%2fb'],
    ])
  })

  it('also allows the directory for an allowed index.html, like Google', () => {
    expect(shape(parse('User-agent: *\nAllow: /shop/index.html\n'))).toEqual([
      [['*'], ['allow:/shop/index.html', 'allow:/shop/$']],
    ])
  })
})

describe('collectRobots', () => {
  const url = 'https://example.com/robots.txt'
  const response = (status: number, text = '') => ({ status, body: utf8(text), truncated: false })

  it('parses a 2xx robots.txt', () => {
    const facts = collectRobots({
      url,
      response: response(200, 'User-agent: *\nDisallow: /\n'),
      errorCode: null,
    })
    expect(facts.outcome).toBe('fetched')
    expect(facts.outcome === 'fetched' && facts.robots.groups).toHaveLength(1)
  })

  it('treats 4xx (except 429) and too many redirects as unavailable: allow all', () => {
    expect(collectRobots({ url, response: response(404), errorCode: null })).toEqual({
      outcome: 'unavailable',
      url,
      status: 404,
    })
    expect(collectRobots({ url, response: null, errorCode: 'too-many-redirects' }).outcome).toBe(
      'unavailable',
    )
  })

  it('treats 5xx, 429 and network failures as unreachable: disallow all', () => {
    expect(collectRobots({ url, response: response(503), errorCode: null })).toEqual({
      outcome: 'unreachable',
      url,
      status: 503,
      reason: 'server-error',
    })
    expect(collectRobots({ url, response: response(429), errorCode: null }).outcome).toBe(
      'unreachable',
    )
    for (const code of ['timeout', 'connect-failed', 'dns-failed', 'tls-failed']) {
      expect(collectRobots({ url, response: null, errorCode: code })).toEqual({
        outcome: 'unreachable',
        url,
        status: null,
        reason: 'network',
      })
    }
  })

  it('reports anything Arablyzer itself refused as failed, not as a verdict', () => {
    for (const code of [
      'blocked-address',
      'port-not-allowed',
      'invalid-redirect',
      'aborted',
      'decode-failed',
    ]) {
      expect(collectRobots({ url, response: null, errorCode: code })).toEqual({
        outcome: 'failed',
        url,
        code,
      })
    }
  })

  it('gives no verdict for a status that is not HTTP (some sites send 999 to bots)', () => {
    for (const status of [999, 600, 99, 0]) {
      expect(collectRobots({ url, response: response(status), errorCode: null })).toEqual({
        outcome: 'failed',
        url,
        code: 'invalid-status',
      })
    }
    expect(collectRobots({ url, response: null, errorCode: 'invalid-status' }).outcome).toBe(
      'failed',
    )
  })

  it('treats a final 3xx without Location as unavailable', () => {
    expect(collectRobots({ url, response: response(302), errorCode: null }).outcome).toBe(
      'unavailable',
    )
  })
})

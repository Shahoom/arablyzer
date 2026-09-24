import { parseRobotsTxt } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { crawlerAccess, matchRobots, patternMatches, robotsPath } from '../src/lib/robots'

const allowed = (robotsTxt: string, agent: string, url: string) =>
  matchRobots(parseRobotsTxt(new TextEncoder().encode(robotsTxt)), agent, url).allowed

// Cases adapted from google/robotstxt robots_test.cc.
describe('matchRobots', () => {
  it('uses the most specific group, merging groups for the same agent', () => {
    const robotsTxt = 'User-agent: *\nDisallow: /\n\nUser-agent: FooBot\nAllow: /\n'
    expect(allowed(robotsTxt, 'FooBot', 'http://foo.bar/x')).toBe(true)
    expect(allowed(robotsTxt, 'BarBot', 'http://foo.bar/x')).toBe(false)
    const merged =
      'User-agent: FooBot\nDisallow: /a\nUser-agent: Other\nDisallow: /\nUser-agent: FooBot\nDisallow: /b\n'
    expect(allowed(merged, 'FooBot', 'http://foo.bar/a')).toBe(false)
    expect(allowed(merged, 'FooBot', 'http://foo.bar/b')).toBe(false)
    expect(allowed(merged, 'FooBot', 'http://foo.bar/c')).toBe(true)
  })

  it('ignores the * group once a specific group exists, even an empty one', () => {
    expect(
      allowed(
        'User-agent: FooBot\nDisallow:\n\nUser-agent: *\nDisallow: /\n',
        'FooBot',
        'http://foo.bar/',
      ),
    ).toBe(true)
  })

  it('matches agents case-insensitively and paths case-sensitively', () => {
    const robotsTxt = 'USER-AGENT: foobot\nDisallow: /X/\n'
    expect(allowed(robotsTxt, 'FooBot', 'http://foo.bar/X/a')).toBe(false)
    expect(allowed(robotsTxt, 'FooBot', 'http://foo.bar/x/a')).toBe(true)
  })

  it('lets the longest pattern win, and allow win a tie', () => {
    const url = 'http://foo.bar/x/page.html'
    expect(allowed('User-agent: FooBot\nDisallow: /x/page.html\nAllow: /x/\n', 'FooBot', url)).toBe(
      false,
    )
    expect(allowed('User-agent: FooBot\nAllow: /x/page.html\nDisallow: /x/\n', 'FooBot', url)).toBe(
      true,
    )
    expect(
      allowed(
        'User-agent: FooBot\nAllow: /x/page.html\nDisallow: /x/\n',
        'FooBot',
        'http://foo.bar/x/',
      ),
    ).toBe(false)
    expect(allowed('User-agent: FooBot\nDisallow: /\nAllow: /\n', 'FooBot', url)).toBe(true)
    expect(
      allowed('User-agent: FooBot\nDisallow: /x\nAllow: /x/\n', 'FooBot', 'http://foo.bar/x'),
    ).toBe(false)
    expect(
      allowed('User-agent: FooBot\nDisallow: /x\nAllow: /x/\n', 'FooBot', 'http://foo.bar/x/'),
    ).toBe(true)
    expect(
      allowed(
        'User-agent: FooBot\nAllow: /page\nDisallow: /*.html\n',
        'FooBot',
        'http://foo.bar/page.html',
      ),
    ).toBe(false)
    expect(allowed('User-agent: FooBot\nAllow: /x/page.\nDisallow: /*.html\n', 'FooBot', url)).toBe(
      true,
    )
  })

  it('treats /index.html allows as allowing the directory', () => {
    const robotsTxt = 'User-agent: *\nAllow: /allowed-slash/index.html\nDisallow: /\n'
    expect(allowed(robotsTxt, 'foobot', 'http://foo.com/allowed-slash/')).toBe(true)
    expect(allowed(robotsTxt, 'foobot', 'http://foo.com/allowed-slash/index.htm')).toBe(false)
    expect(allowed(robotsTxt, 'foobot', 'http://foo.com/allowed-slash/index.html')).toBe(true)
    expect(allowed(robotsTxt, 'foobot', 'http://foo.com/anyother-url')).toBe(false)
  })

  it('matches Arabic paths through percent-encoding', () => {
    expect(
      allowed('User-agent: *\nDisallow: /منتجات/\n', 'x', 'https://example.com/منتجات/عطر'),
    ).toBe(false)
    expect(allowed('User-agent: *\nDisallow: /%d9%85/\n', 'x', 'https://example.com/م/')).toBe(
      false,
    )
  })

  it('always allows /robots.txt and allows everything without groups', () => {
    expect(allowed('User-agent: *\nDisallow: /\n', 'x', 'http://foo.bar/robots.txt')).toBe(true)
    expect(allowed('# nothing here\n', 'x', 'http://foo.bar/')).toBe(true)
  })

  it('reports the deciding rule and group', () => {
    const robots = parseRobotsTxt(new TextEncoder().encode('User-agent: *\nDisallow: /private\n'))
    expect(matchRobots(robots, 'Googlebot', 'https://example.com/private/a')).toMatchObject({
      allowed: false,
      group: 'global',
      rule: { text: 'Disallow: /private', line: 2 },
    })
  })
})

describe('patternMatches', () => {
  it.each([
    ['/fish*.php', '/fish.php', true],
    ['/fish*.php', '/fishheads/catfish.php?parameters', true],
    ['/fish*.php', '/Fish.PHP', false],
    ['/*.php$', '/filename.php', true],
    ['/*.php$', '/filename.php?parameters', false],
    ['/*.php$', '/filename.php5', false],
    ['/fish$', '/fish', true],
    ['/fish$', '/fish/', false],
    ['/a$b', '/a$b', true],
    ['*', '/anything', true],
  ])('%s against %s → %s', (pattern, path, expected) => {
    expect(patternMatches(path, pattern)).toBe(expected)
  })
})

describe('robotsPath and crawlerAccess', () => {
  it('keeps the query, drops the fragment and upper-cases escapes', () => {
    expect(robotsPath('https://example.com/a%2fb?q=1#frag')).toBe('/a%2Fb?q=1')
  })

  it('maps robots.txt outcomes to access', () => {
    const url = 'https://example.com/'
    const robotsUrl = 'https://example.com/robots.txt'
    expect(
      crawlerAccess({ outcome: 'unavailable', url: robotsUrl, status: 404 }, 'Googlebot', url),
    ).toEqual({
      basis: 'unavailable',
      allowed: true,
    })
    expect(
      crawlerAccess(
        { outcome: 'unreachable', url: robotsUrl, status: 503, reason: 'server-error' },
        'Googlebot',
        url,
      ),
    ).toEqual({ basis: 'unreachable', allowed: false })
    expect(
      crawlerAccess(
        { outcome: 'failed', url: robotsUrl, code: 'blocked-address' },
        'Googlebot',
        url,
      ),
    ).toBeNull()
  })
})

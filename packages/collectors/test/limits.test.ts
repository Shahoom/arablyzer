import { describe, expect, it } from 'vitest'
import { collectPage, HTML_PARSE_LIMIT, type CollectOptions } from '../src/page'
import { parseRobotsTxt } from '../src/robots'
import { utf8 } from './helpers'

// Hostile pages must not stall a scan (M0.2 review): collection is linear in the page size,
// never recursive, and HTML parsing stops at a deadline.

function collect(html: string, options?: CollectOptions) {
  return collectPage(
    {
      url: 'https://example.com/',
      status: 200,
      headers: [['content-type', 'text/html; charset=utf-8']],
      body: utf8(html),
    },
    options,
  )
}

function timed<T>(run: () => T): { value: T; ms: number } {
  const start = performance.now()
  const value = run()
  return { value, ms: performance.now() - start }
}

describe('collectPage on hostile HTML', () => {
  it('stays linear with tens of thousands of siblings', () => {
    const { value, ms } = timed(() => collect(`<body>${'<a href="/x">ب</a>'.repeat(30_000)}`))
    expect(value.html?.anchors).toHaveLength(30_000)
    expect(value.html?.anchors.at(-1)?.selector).toBe('body > a:nth-of-type(30000)')
    expect(ms).toBeLessThan(5000)
  })

  it('does not recurse: deep nesting cannot overflow the stack', () => {
    const facts = collect(`<html lang="ar"><body>${'<div>'.repeat(5000)}مرحبا<a href="/x">ب</a>`)
    expect(facts.text?.letters.arabic).toBe(6)
    expect(facts.html?.anchors).toHaveLength(1)
    expect(facts.htmlTimedOut).toBe(false)
  })

  it('stops parsing at the deadline and says so', () => {
    const { value, ms } = timed(() =>
      collect(`<body>${'<div>'.repeat(40_000)}نص`, { deadline: performance.now() + 50 }),
    )
    expect(value).toMatchObject({ isHtml: true, html: null, text: null, htmlTimedOut: true })
    expect(ms).toBeLessThan(2000)
  })

  it('parses only the first bytes up to the limit, and says so', () => {
    const facts = collect(`<p>${'ب'.repeat(1000)}</p><p>${'x'.repeat(1000)}</p>`, {
      maxHtmlBytes: 1000,
    })
    expect(facts.htmlTruncated).toBe(true)
    expect(facts.text?.letters).toMatchObject({ arabic: 498, latin: 0 })
    expect(collect('<p>ب</p>').htmlTruncated).toBe(false)
  })

  it('uses the 15 MB Googlebot limit by default', () => {
    expect(HTML_PARSE_LIMIT).toBe(15 * 1024 * 1024)
  })
})

describe('parseRobotsTxt on hostile input', () => {
  it('trims long runs of whitespace in linear time', () => {
    const line = `User-agent: *${' '.repeat(16_600)}x\n`
    const body = utf8(line.repeat(Math.floor((500 * 1024) / line.length)))
    const { value, ms } = timed(() => parseRobotsTxt(body))
    expect(value.groups.length).toBeGreaterThan(0)
    expect(ms).toBeLessThan(2000)
  })
})

import { describe, expect, it } from 'vitest'
import {
  collectPage,
  HTML_PARSE_LIMIT,
  MAX_HTML_DEPTH,
  MAX_HTML_NODES,
  type CollectOptions,
  type PageFacts,
} from '../src/page'
import { parseRobotsTxt } from '../src/robots'
import { utf8 } from './helpers'

// Hostile pages must not stall a scan (M0.2 review): collection is linear in the page size,
// never recursive, and HTML parsing stops at a deadline. Nor may they exhaust its memory (H1 of
// the pre-launch review): the tree holds a bounded number of nodes, nested a bounded depth.

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
    expect(facts.htmlTooComplex).toBe(false)
  })

  it('stops parsing at the deadline and says so', () => {
    const { value, ms } = timed(() =>
      collect(`<body>${'<div>'.repeat(40_000)}نص`, { deadline: performance.now() + 50 }),
    )
    expect(value).toMatchObject({ isHtml: true, html: null, text: null, htmlTooComplex: true })
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

function expectTooComplex(facts: PageFacts) {
  expect(facts).toMatchObject({
    isHtml: true,
    html: null,
    text: null,
    htmlTruncated: false,
    htmlTooComplex: true,
  })
}

// H1: a page of 1.4 million <p> is 4 KB gzipped and 4.2 MB read, and its tree took more heap than
// the scanner's container has (696 MB): the process died, and the queue with it. The limits do
// not read the clock: the same page is too complex on every machine.
describe('collectPage on a page too big to hold as a tree', { timeout: 60_000 }, () => {
  it('gives up on 1.4 million elements, without a deadline, in a moment', () => {
    const { value, ms } = timed(() => collect(`<body>${'<p>'.repeat(1_400_000)}`))
    expectTooComplex(value)
    expect(ms).toBeLessThan(10_000)
  })

  it('gives up on 100,000 nested elements, without a deadline, in a moment', () => {
    const { value, ms } = timed(() => collect(`<body>${'<div>'.repeat(100_000)}`))
    expectTooComplex(value)
    expect(ms).toBeLessThan(10_000)
  })

  it('counts comments with the elements: 2 million of them are 14 MB and 400 MB of heap', () => {
    const { value, ms } = timed(() => collect(`<body>${'<!---->'.repeat(2_000_000)}`))
    expectTooComplex(value)
    expect(ms).toBeLessThan(10_000)
  })

  it('counts the elements the parser makes itself, and reads a page at the limit', () => {
    // <html>, <head> and <body> are the parser's own.
    const at = (elements: number, options?: CollectOptions) =>
      collect(`<body>${'<p>'.repeat(elements)}`, options)
    expect(at(7, { maxNodes: 10 }).htmlTooComplex).toBe(false)
    expectTooComplex(at(8, { maxNodes: 10 }))
    const comments = (count: number) =>
      collect(`<body>${'<!--a-->'.repeat(count)}`, { maxNodes: 10 })
    expect(comments(7).htmlTooComplex).toBe(false)
    expectTooComplex(comments(8))
  })

  it('nests as deep as the limit and no deeper', () => {
    // <html> is at depth 1 and <body> at 2, so the first <div> is at 3.
    const at = (divs: number) => collect('<div>'.repeat(divs), { maxDepth: 50 })
    expect(at(48).htmlTooComplex).toBe(false)
    expectTooComplex(at(49))
    // A template's content is not a way round it: the fragment sits where the template does.
    const templates = (count: number) => collect('<template>'.repeat(count), { maxDepth: 50 })
    expect(templates(5).htmlTooComplex).toBe(false)
    expectTooComplex(templates(60))
  })

  it('states its limits, and reads a page that reaches them', () => {
    expect(MAX_HTML_NODES).toBe(200_000)
    expect(MAX_HTML_DEPTH).toBe(10_000)
    // html, head and body are three of the nodes; html and body are two of the levels.
    const wide = timed(() => collect(`<body>${'<p>'.repeat(MAX_HTML_NODES - 3)}`))
    expect(wide.value.htmlTooComplex).toBe(false)
    expect(wide.ms).toBeLessThan(10_000)
    expectTooComplex(collect(`<body>${'<p>'.repeat(MAX_HTML_NODES - 2)}`))
    const deep = timed(() => collect(`<html><body>${'<div>'.repeat(MAX_HTML_DEPTH - 2)}`))
    expect(deep.value.htmlTooComplex).toBe(false)
    expect(deep.ms).toBeLessThan(10_000)
    expectTooComplex(collect(`<html><body>${'<div>'.repeat(MAX_HTML_DEPTH - 1)}`))
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

import { describe, expect, it } from 'vitest'
import type { CodeExample, Tool, ToolCopy } from '../src/index'
import { evaluateExample, exampleProblems, speaksTo } from './example-check'

const http = (code: string): CodeExample => ({ lang: 'http', code })

/** A tool of these rules, whose page shows these examples in both languages. */
function toolOf(rules: string[], wrong: CodeExample, right: CodeExample): Tool {
  const copy: ToolCopy = {
    title: 'x',
    description: 'x',
    summary: 'x',
    checks: ['x'],
    example: { wrong, right },
    fix: 'x',
    faq: [{ question: 'x', answer: 'x' }],
    methodology: 'x',
    reviewed: false,
  }
  return {
    slug: 'test-tool',
    category: 'trust',
    rules,
    related: [],
    updated: '2026-09-29',
    copy: { ar: copy, en: copy },
  }
}

const PAGE = 'HTTP/1.1 200 OK\nContent-Type: text/html; charset=utf-8'
const HSTS = 'Strict-Transport-Security: max-age=31536000; includeSubDomains'

describe('an HTTP example', () => {
  it('speaks to the rules that read headers or redirects, and to no other', () => {
    const example = http(PAGE)
    for (const id of ['hsts-missing', 'csp-missing', 'redirect-chain', 'page-noindex']) {
      expect(speaksTo(example, id), id).toBe(true)
    }
    // The address and the certificate are not in the exchange; robots.txt is another file.
    for (const id of [
      'https-missing',
      'tls-expiring',
      'robots-blocks-googlebot',
      'title-missing',
    ]) {
      expect(speaksTo(example, id), id).toBe(false)
    }
    expect(speaksTo({ lang: 'html', code: '<p>x</p>' }, 'https-missing')).toBe(true)
    expect(speaksTo({ lang: 'robots.txt', code: '' }, 'hsts-missing')).toBe(false)
  })

  it('is the answers to a request for the page: the redirects, then the page', () => {
    const results = evaluateExample(
      toolOf(['redirect-chain'], http(PAGE), http(PAGE)),
      http(
        [
          'HTTP/1.1 301 Moved Permanently',
          'Location: https://www.example.com/',
          '',
          'HTTP/1.1 301 Moved Permanently',
          'Location: /ar/',
          '',
          PAGE,
        ].join('\n'),
      ),
    )
    expect(results.map((result) => [result.id, result.status])).toEqual([
      ['redirect-chain', 'fail'],
    ])
  })

  it('holds a tool whose rules an exchange partly shows: the others must not fail', () => {
    const tls = ['https-missing', 'tls-expiring', 'hsts-missing']
    expect(exampleProblems(toolOf(tls, http(PAGE), http(`${PAGE}\n${HSTS}`)), 'ar')).toEqual([])
    expect(exampleProblems(toolOf(tls, http(PAGE), http(PAGE)), 'en')).toEqual([
      'hsts-missing fails on the right example',
      'hsts-missing is fail on the right example',
    ])
    // An exchange that shows none of the tool's rules says nothing of it.
    expect(
      exampleProblems(toolOf(['https-missing', 'tls-expiring'], http(PAGE), http(PAGE)), 'ar'),
    ).toEqual([
      'none of https-missing, tls-expiring fails the wrong example',
      'the right example speaks to none of the rules',
    ])
  })

  it('shows redirect rules failing and passing', () => {
    const rules = ['redirect-chain', 'redirect-temporary']
    const wrong = http(
      [
        'HTTP/1.1 302 Found',
        'Location: https://www.example.com/',
        '',
        'HTTP/1.1 301 Moved Permanently',
        'Location: https://www.example.com/ar/',
        '',
        PAGE,
      ].join('\n'),
    )
    const right = http(
      ['HTTP/1.1 301 Moved Permanently', 'Location: https://www.example.com/ar/', '', PAGE].join(
        '\n',
      ),
    )
    const tool = toolOf(rules, wrong, right)
    expect(evaluateExample(tool, wrong).map((result) => result.status)).toEqual(['fail', 'fail'])
    expect(exampleProblems(tool, 'ar')).toEqual([])
  })
})

/** An answer of the Chrome UX Report API, as its documentation shows one, for a URL or an origin. */
function answer(key: Record<string, string>, lcp: number, inp: number, cls: string): string {
  const metric = (p75: number | string) => ({ percentiles: { p75 } })
  return JSON.stringify({
    record: {
      key: { formFactor: 'PHONE', ...key },
      metrics: {
        largest_contentful_paint: metric(lcp),
        interaction_to_next_paint: metric(inp),
        cumulative_layout_shift: metric(cls),
      },
      collectionPeriod: {
        firstDate: { year: 2026, month: 8, day: 30 },
        lastDate: { year: 2026, month: 9, day: 26 },
      },
    },
  })
}

describe('a Chrome UX Report example', () => {
  const json = (code: string): CodeExample => ({ lang: 'json', code })
  const vitals = ['cwv-lcp-poor', 'cwv-inp-poor', 'cwv-cls-poor']
  const url = { url: 'https://www.example.com/' }

  it('speaks to the rules that read real visitors’ data, and to no other', () => {
    for (const id of vitals) expect(speaksTo(json('{}'), id), id).toBe(true)
    for (const id of ['title-missing', 'hsts-missing', 'robots-blocks-googlebot']) {
      expect(speaksTo(json('{}'), id), id).toBe(false)
    }
    expect(speaksTo({ lang: 'html', code: '<p>x</p>' }, 'cwv-lcp-poor')).toBe(false)
  })

  it('is the API’s answer about the page, or about its origin', () => {
    const tool = toolOf(vitals, json('{}'), json('{}'))
    const statuses = (code: string) =>
      evaluateExample(tool, json(code)).map((result) => [result.id, result.status])
    expect(statuses(answer(url, 5_200, 180, '0.05'))).toEqual([
      ['cwv-cls-poor', 'pass'],
      ['cwv-inp-poor', 'pass'],
      ['cwv-lcp-poor', 'fail'],
    ])
    expect(statuses(answer({ origin: 'https://www.example.com' }, 2_100, 650, '0.31'))).toEqual([
      ['cwv-cls-poor', 'fail'],
      ['cwv-inp-poor', 'fail'],
      ['cwv-lcp-poor', 'pass'],
    ])
  })

  it('holds a page whose wrong answer fails a rule and whose right one passes them all', () => {
    const good = json(answer(url, 2_100, 180, '0.05'))
    expect(
      exampleProblems(toolOf(vitals, json(answer(url, 5_200, 180, '0.05')), good), 'en'),
    ).toEqual([])
    expect(exampleProblems(toolOf(vitals, good, good), 'ar')).toEqual([
      'none of cwv-lcp-poor, cwv-inp-poor, cwv-cls-poor fails the wrong example',
    ])
    // An answer that is not the API's is no data: the rules report an error.
    const slow = json(answer(url, 5_200, 180, '0.05'))
    expect(exampleProblems(toolOf(vitals, slow, json('{}')), 'en')).toEqual([
      'cwv-cls-poor errors on the right example',
      'cwv-inp-poor errors on the right example',
      'cwv-lcp-poor errors on the right example',
      'cwv-cls-poor is error on the right example',
      'cwv-inp-poor is error on the right example',
      'cwv-lcp-poor is error on the right example',
    ])
  })
})

describe('a robots.txt example', () => {
  const robots = (code: string): CodeExample => ({ lang: 'robots.txt', code })
  const rules = ['sitemap-missing', 'sitemap-invalid']

  it('shows the sitemaps it names, which are not in it: the rules judge its Sitemap lines', () => {
    const none = robots('User-agent: *\nDisallow: /cart/')
    const named = robots(
      'User-agent: *\nDisallow: /cart/\n\nSitemap: https://www.example.com/sitemap.xml',
    )
    const relative = robots('Sitemap: /sitemap.xml')
    const tool = toolOf(rules, none, named)
    const statuses = (example: CodeExample) =>
      evaluateExample(tool, example).map((result) => [result.id, result.status])
    // Naming none, the site has no /sitemap.xml either, as far as the example shows.
    expect(statuses(none)).toEqual([
      ['sitemap-invalid', 'not-applicable'],
      ['sitemap-missing', 'fail'],
    ])
    expect(statuses(named)).toEqual([
      ['sitemap-invalid', 'pass'],
      ['sitemap-missing', 'pass'],
    ])
    expect(statuses(relative)).toEqual([
      ['sitemap-invalid', 'fail'],
      ['sitemap-missing', 'fail'],
    ])
    expect(exampleProblems(tool, 'en')).toEqual([])
  })
})

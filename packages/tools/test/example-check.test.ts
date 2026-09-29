import { describe, expect, it } from 'vitest'
import type { CodeExample, Tool, ToolCopy } from '../src/index'
import { evaluateExample, exampleProblems, reportsOnly, speaksTo } from './example-check'

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

const dns = (code: string): CodeExample => ({ lang: 'dns', code })

describe('a DNS example', () => {
  it('speaks to the rules that read DNS, and to no other', () => {
    const example = dns('example.com. TXT "v=spf1 -all"')
    for (const id of ['spf-missing', 'dmarc-missing']) expect(speaksTo(example, id), id).toBe(true)
    for (const id of ['hsts-missing', 'title-missing', 'robots-blocks-googlebot']) {
      expect(speaksTo(example, id), id).toBe(false)
    }
    expect(speaksTo({ lang: 'html', code: '<p>x</p>' }, 'spf-missing')).toBe(false)
  })

  it("is what DNS answers for the page's domain: its records, and none where it gives none", () => {
    const rules = ['spf-missing', 'dmarc-missing']
    const status = (code: string) =>
      evaluateExample(toolOf(rules, dns(code), dns(code)), dns(code)).map((result) => [
        result.id,
        result.status,
      ])
    expect(status('example.com. TXT "v=spf1 -all"')).toEqual([
      ['dmarc-missing', 'fail'],
      ['spf-missing', 'pass'],
    ])
    expect(status('_dmarc.example.com. TXT "v=DMARC1; p=reject"')).toEqual([
      ['dmarc-missing', 'pass'],
      ['spf-missing', 'fail'],
    ])
    // Records at another name are not the domain's.
    expect(status('www.example.com. TXT "v=spf1 -all"')).toEqual([
      ['dmarc-missing', 'fail'],
      ['spf-missing', 'fail'],
    ])
  })
})

const html = (code: string): CodeExample => ({ lang: 'html', code })

describe('an information tool', () => {
  const unnamed = html('<img src="/pay/mada.svg">')
  const named = html('<img src="/pay/mada.svg" alt="مدى">')

  it('is one whose rules are all information', () => {
    expect(reportsOnly(toolOf(['payment-methods'], unnamed, named))).toBe(true)
    expect(reportsOnly(toolOf(['payment-methods', 'title-missing'], unnamed, named))).toBe(false)
  })

  it('shows as wrong what it can name nothing on, and as right what it reports', () => {
    expect(exampleProblems(toolOf(['payment-methods'], unnamed, named), 'ar')).toEqual([])
    expect(exampleProblems(toolOf(['payment-methods'], named, unnamed), 'en')).toEqual([
      'payment-methods is fail on the wrong example, which names nothing',
      'none of payment-methods reports on the right example',
    ])
  })
})

import type { Header } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const HTML: Header = ['content-type', 'text/html; charset=utf-8']
const secure = (...values: string[]) =>
  evidenceOf(
    htmlPage('<p>نص</p>', {
      url: 'https://shop.example/',
      headers: [HTML, ...values.map((value): Header => ['strict-transport-security', value])],
    }),
  )

describe('hsts-missing', () => {
  it('fires on an HTTPS page without Strict-Transport-Security', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong'))).toEqual([
      { message: 'missing' },
    ])
  })

  it('passes a page that keeps browsers on HTTPS for a year', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right'))).toEqual([])
    expect(detectAll(rule, secure('max-age="600"'))).toEqual([])
  })

  it('fires when max-age is 0, which tells browsers to forget, or the header is not valid', () => {
    expect(detectAll(rule, secure('max-age=0'))).toEqual([
      { message: 'zero', snippet: 'max-age=0' },
    ])
    for (const value of ['includeSubDomains', 'max-age=soon', 'max-age=1; max-age=2']) {
      expect(detectAll(rule, secure(value)), value).toEqual([
        { message: 'invalid', values: { value }, snippet: value },
      ])
    }
  })

  it('reads only the first header, as browsers do', () => {
    expect(detectAll(rule, secure('max-age=0', 'max-age=31536000'))).toMatchObject([
      { message: 'zero' },
    ])
  })

  it('leaves out plain HTTP and addresses, which browsers keep no HSTS for', () => {
    expect(applies(rule, evidenceOf(htmlPage('<p>نص</p>', { url: 'http://shop.example/' })))).toBe(
      false,
    )
    expect(applies(rule, evidenceOf(htmlPage('<p>نص</p>', { url: 'https://203.0.113.5/' })))).toBe(
      false,
    )
  })
})

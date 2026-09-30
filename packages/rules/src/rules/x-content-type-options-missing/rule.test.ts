import type { Header } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const HTML: Header = ['content-type', 'text/html; charset=utf-8']
const sent = (...values: string[]) =>
  evidenceOf(
    htmlPage('<p>نص</p>', {
      url: 'https://shop.example/',
      headers: [HTML, ...values.map((value): Header => ['x-content-type-options', value])],
    }),
  )

describe('x-content-type-options-missing', () => {
  it('fires on a page without X-Content-Type-Options', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong'))).toEqual([
      { message: 'missing' },
    ])
  })

  it('passes a page that sends nosniff', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right'))).toEqual([])
  })

  it('reads nosniff whatever its case, and only as the first value, as browsers do', () => {
    for (const values of [
      ['nosniff'],
      ['NoSniff'],
      [' nosniff '],
      ['nosniff, x'],
      ['nosniff', 'x'],
    ]) {
      expect(detectAll(rule, sent(...values)), values.join(' | ')).toEqual([])
    }
    // Two headers are one list: the first value is the first header's.
    expect(detectAll(rule, sent('sniff', 'nosniff'))).toEqual([
      {
        message: 'invalid',
        values: { value: 'sniff' },
        snippet: 'X-Content-Type-Options: sniff, nosniff',
      },
    ])
    for (const value of ['', 'nosniff;', '"nosniff"', 'no-sniff', 'x, nosniff']) {
      expect(detectAll(rule, sent(value)), value).toMatchObject([{ message: 'invalid' }])
    }
  })

  it('leaves out local development hosts and what is not HTML', () => {
    for (const url of ['http://localhost:4321/', 'http://192.168.1.10/', 'https://shop.test/']) {
      expect(applies(rule, evidenceOf(htmlPage('<p>نص</p>', { url }))), url).toBe(false)
    }
    const script = htmlPage('alert(1)', {
      url: 'https://shop.example/app.js',
      headers: [['content-type', 'text/javascript']],
    })
    expect(applies(rule, evidenceOf(script))).toBe(false)
  })
})

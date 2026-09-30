import type { Header } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const HTML: Header = ['content-type', 'text/html; charset=utf-8']
const page = (html: string, ...headers: Header[]) =>
  evidenceOf(htmlPage(html, { url: 'https://shop.example/', headers: [HTML, ...headers] }))
const header = (...values: string[]) =>
  page('<p>نص</p>', ...values.map((value): Header => ['referrer-policy', value]))
const meta = (content: string) =>
  page(`<html><head><meta name="referrer" content="${content}"></head></html>`)

describe('referrer-policy-missing', () => {
  it('says so of a page that sets no referrer policy', async () => {
    expect(rule.severity).toBe('info')
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong'))).toEqual([
      { message: 'missing' },
    ])
  })

  it('passes a policy in the header, or in a <meta name="referrer">', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right'))).toEqual([])
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right-meta'))).toEqual([])
  })

  it('reads the header as browsers do: the last value they know wins', () => {
    for (const values of [
      ['no-referrer'],
      ['no-referrer, strict-origin-when-cross-origin'],
      ['strict-origin-when-cross-origin, some-future-policy'],
      ['same-origin', 'unsafe-url'],
      ['Strict-Origin'],
      [' origin '],
    ]) {
      expect(detectAll(rule, header(...values)), values.join(' | ')).toEqual([])
    }
    for (const values of [[''], ['nope'], ['never'], ['no_referrer, same-origin']]) {
      expect(detectAll(rule, header(...values)), values.join(' | ')).toEqual([
        {
          message: 'invalid',
          values: { value: values.join(', ') },
          snippet: `Referrer-Policy: ${values.join(', ')}`,
        },
      ])
    }
  })

  it('reads a <meta name="referrer"> as HTML does, its old values included', () => {
    for (const content of ['same-origin', 'NO-REFERRER', 'never', 'default', 'always']) {
      expect(detectAll(rule, meta(content)), content).toEqual([])
    }
    // One value only, as written: no list, no spaces around it.
    for (const content of ['no-referrer, same-origin', ' origin', 'nope']) {
      expect(detectAll(rule, meta(content)), content).toMatchObject([
        { message: 'invalid', values: { value: content }, selector: 'head > meta' },
      ])
    }
    // Anywhere in the document, not only in <head>.
    expect(detectAll(rule, page('<body><meta name="Referrer" content="origin"></body>'))).toEqual(
      [],
    )
    // An empty content is no policy at all.
    expect(detectAll(rule, meta(''))).toEqual([{ message: 'missing' }])
  })

  it('leaves out local development hosts and what is not HTML', () => {
    for (const url of ['http://localhost:4321/', 'http://127.0.0.1:8080/', 'https://shop.test/']) {
      expect(applies(rule, evidenceOf(htmlPage('<p>نص</p>', { url }))), url).toBe(false)
    }
    const text = htmlPage('نص', {
      url: 'https://shop.example/robots.txt',
      headers: [['content-type', 'text/plain']],
    })
    expect(applies(rule, evidenceOf(text))).toBe(false)
  })
})

import type { Header } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const HTML: Header = ['content-type', 'text/html; charset=utf-8']
const withHeaders = (...values: string[]) =>
  rule.detect(
    evidenceOf(
      htmlPage('<p>نص</p>', {
        headers: [HTML, ...values.map((value): Header => ['x-robots-tag', value])],
      }),
    ),
  )
const withMeta = (name: string, content: string) =>
  rule.detect(evidenceOf(htmlPage(`<meta name="${name}" content="${content}"><p>نص</p>`)))

describe('page-noindex', () => {
  it('fires on the X-Robots-Tag fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(rule.detect(evidence)).toEqual([
      {
        message: 'header',
        snippet: 'X-Robots-Tag: noindex',
        values: { value: 'noindex', directive: 'noindex' },
        key: 'header:noindex',
      },
    ])
  })

  it('fires on the meta fixture and points at the tag', async () => {
    const [finding] = rule.detect(await fixtureEvidence(rule.id, 'wrong-meta'))
    expect(finding).toMatchObject({
      message: 'meta',
      selector: 'head > meta:nth-of-type(3)',
      snippet: '<meta name="robots" content="noindex, follow" />',
      location: { line: 7, column: 5 },
      values: { name: 'robots', content: 'noindex, follow', directive: 'noindex' },
    })
  })

  it('passes the right fixture', async () => {
    expect(rule.detect(await fixtureEvidence(rule.id, 'right'))).toEqual([])
  })

  it.each([
    ['noindex'],
    ['NOINDEX, nofollow'],
    ['none'],
    ['googlebot: noindex'],
    ['nofollow, googlebot: noindex'],
    ['max-snippet: 20, noindex'],
  ])('fires on X-Robots-Tag: %s', (value) => {
    expect(withHeaders(value)).toHaveLength(1)
  })

  it.each([
    ['nofollow'],
    ['max-image-preview:large'],
    ['otherbot: noindex, nofollow'],
    ['googlebot-news: noindex'],
    ['unavailable_after: 25 Jun 2010 15:00:00 PST'],
  ])('passes X-Robots-Tag: %s', (value) => {
    expect(withHeaders(value)).toEqual([])
  })

  it('reads every X-Robots-Tag header', () => {
    expect(
      withHeaders('otherbot: noindex', 'googlebot: noindex').map(
        (finding) => finding.values?.value,
      ),
    ).toEqual(['googlebot: noindex'])
  })

  it('reads robots and googlebot metas, in any case, and ignores other agents', () => {
    expect(withMeta('ROBOTS', 'NoIndex')).toHaveLength(1)
    expect(withMeta('googlebot', 'none')).toHaveLength(1)
    expect(withMeta('googlebot-news', 'noindex')).toEqual([])
    expect(withMeta('bingbot', 'noindex')).toEqual([])
    expect(withMeta('robots', 'index, follow')).toEqual([])
  })

  it('checks the header of non-HTML responses too', () => {
    const pdf = htmlPage('%PDF-1.7', {
      headers: [
        ['content-type', 'application/pdf'],
        ['x-robots-tag', 'noindex'],
      ],
    })
    expect(rule.appliesTo(pdf)).toBe(true)
    expect(rule.detect(evidenceOf(pdf))).toHaveLength(1)
  })
})

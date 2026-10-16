import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureFeed, htmlPage, rssFeed } from '../../../test/helpers'
import { rule } from './rule'

const FULL = `<g:id>1</g:id><title>t</title><description>d</description><link>https://x.example/1</link>
<g:image_link>https://x.example/1.jpg</g:image_link><g:price>1.00 SAR</g:price><g:availability>in_stock</g:availability>`

describe('feed-required-missing', () => {
  it('fails the wrong fixture: each missing attribute once, and the repeated id', () => {
    const evidence = fixtureFeed(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page, evidence)).toBe(true)
    expect(
      detectAll(rule, evidence).map((item) => [
        item.message,
        item.values?.attribute ?? item.values?.id,
      ]),
    ).toEqual([
      ['missing', 'description'],
      ['missing', 'image_link'],
      ['duplicate-id', 'OUD-1'],
    ])
  })

  it('passes the right fixture', () => {
    const evidence = fixtureFeed(rule.id, 'right')
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('counts the products that lack an attribute and names the first', () => {
    const [finding] = detectAll(
      rule,
      rssFeed(
        FULL,
        FULL.replace('<g:id>1</g:id>', '<g:id>2</g:id>').replace('<g:price>1.00 SAR</g:price>', ''),
        FULL.replace('<g:id>1</g:id>', '<g:id>3</g:id>').replace(
          '<g:price>1.00 SAR</g:price>',
          '<g:price> </g:price>',
        ),
      ),
    )
    expect(finding).toMatchObject({
      message: 'missing',
      values: { attribute: 'price', count: 2, total: '3', id: '2' },
    })
  })

  it('names a product without an id by its place', () => {
    const [finding] = detectAll(rule, rssFeed(FULL.replace('<g:id>1</g:id>', '')))
    expect(finding?.values).toMatchObject({ attribute: 'id', id: '#1' })
  })

  it('does not apply to a file that is no feed, nor to a scan that read none', () => {
    const page = htmlPage('<p>x</p>')
    expect(rule.appliesTo(page, evidenceOf(page))).toBe(false)
    const unreadable = {
      ...evidenceOf(page),
      feed: { kind: 'unreadable', reason: 'empty' } as const,
    }
    expect(rule.appliesTo(page, unreadable)).toBe(false)
  })
})

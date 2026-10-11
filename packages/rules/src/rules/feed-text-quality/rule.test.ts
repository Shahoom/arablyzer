import { describe, expect, it } from 'vitest'
import { detectAll, fixtureFeed, rssFeed } from '../../../test/helpers'
import { rule } from './rule'

const item = (title: string, description = 'وصف مختلف عن العنوان تماماً.') =>
  `<g:id>1</g:id><title>${title}</title><description>${description}</description>`
const messages = (title: string, description?: string) =>
  detectAll(rule, rssFeed(item(title, description))).map((finding) => finding.message)

describe('feed-text-quality', () => {
  it('fails the wrong fixture with each kind of problem once', () => {
    expect(
      detectAll(rule, fixtureFeed(rule.id, 'wrong')).map((finding) => finding.message),
    ).toEqual([
      'title-caps',
      'title-promotional',
      'description-same-as-title',
      'tatweel',
      'garbled',
    ])
  })

  it('passes the right fixture', () => {
    expect(detectAll(rule, fixtureFeed(rule.id, 'right'))).toEqual([])
  })

  it('counts the characters of a title and a description, not their code units', () => {
    expect(messages('ب'.repeat(150))).toEqual([])
    expect(messages('ب'.repeat(151))).toEqual(['title-long'])
    expect(messages('😀'.repeat(150))).toEqual([])
    expect(messages('عطر', 'ب'.repeat(5000))).toEqual([])
    expect(messages('عطر', 'ب'.repeat(5001))).toEqual(['description-long'])
  })

  it('calls a title capitals only when its Latin letters are the title and none is lowercase', () => {
    expect(messages('ROYAL OUD 50ML')).toEqual(['title-caps'])
    expect(messages('عطر ROYAL OUD الملكي')).toEqual([])
    expect(messages('Royal OUD')).toEqual([])
    expect(messages('USB')).toEqual([])
    expect(messages('عطر العود')).toEqual([])
  })

  it.each([
    ['عطر العود شحن مجاني', true],
    ['عطر العود - توصيل مجاني', true],
    ['Oud perfume FREE SHIPPING', true],
    ['Oud perfume 50% off', true],
    ['عطر العود خصم 20%', true],
    ['Oud wholesale pack', false],
    ['عطر خصمان', false],
    ['عطر العود الملكي', false],
  ])('%j promotional: %s', (title, promotional) => {
    expect(messages(title).includes('title-promotional')).toBe(promotional)
  })

  it('finds a description that repeats the title, whatever its case and spaces', () => {
    expect(messages('عطر  العود', 'عطر العود')).toEqual(['description-same-as-title'])
    expect(messages('Oud', 'oud')).toEqual(['description-same-as-title'])
  })

  it('counts products and shows the first', () => {
    const [finding] = detectAll(rule, rssFeed(item('ROYAL OUD'), item('MUSK WHITE'), item('Oud')))
    expect(finding).toMatchObject({ message: 'title-caps', values: { count: 2, id: '1' } })
  })
})

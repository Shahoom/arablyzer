import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const page = (head: string) => htmlPage(`<html lang="ar"><head>${head}</head><body>x</body></html>`)
const found = (head: string) =>
  detectAll(rule, evidenceOf(page(head))).map((finding) => finding.message)
const og = (content: string, property = 'og:image') =>
  `<meta property="${property}" content="${content}">`

describe('og-image-invalid', () => {
  it('fails the wrong fixture: a relative og:image and an http SVG twitter:image', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(
      detectAll(rule, evidence).map((finding) => [finding.message, finding.values?.tag]),
    ).toEqual([
      ['relative', 'og:image'],
      ['insecure', 'twitter:image'],
    ])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it.each([
    ['/og.png', 'relative'],
    ['og.png', 'relative'],
    ['//cdn.example.com/og.png', 'relative'],
    ['http://cdn.example.com/og.png', 'insecure'],
    ['https://cdn.example.com/og.svg', 'unsupported'],
    ['https://cdn.example.com/og.SVG?v=2', 'unsupported'],
    ['https://cdn.example.com/favicon.ico', 'unsupported'],
    ['https://cdn.example.com/og.avif', 'unsupported'],
  ])('%j → %s', (content, message) => {
    expect(found(og(content))).toEqual([message])
  })

  it.each([
    ['https://cdn.example.com/og.png'],
    ['https://cdn.example.com/og.jpg?v=3'],
    ['https://cdn.example.com/og.webp'],
    ['https://cdn.example.com/image/12345'],
    ['https://cdn.example.com/svg/og.png'],
  ])('accepts %s', (content) => {
    expect(found(og(content))).toEqual([])
  })

  it('reads the property or the name, and every image tag', () => {
    expect(found('<meta name="og:image" content="/a.png">')).toEqual(['relative'])
    expect(found('<meta name="twitter:image" content="">')).toEqual([])
    expect(found(og('/a.png', 'og:image:url') + og('/b.png', 'og:image:secure_url'))).toEqual([
      'relative',
      'relative',
    ])
  })

  it('does not apply to a page without an image tag', () => {
    expect(rule.appliesTo(page(og('x', 'og:title')))).toBe(false)
  })
})

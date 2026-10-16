import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const page = (url: string, head = '') =>
  htmlPage(`<html lang="ar"><head>${head}</head><body><p>x</p></body></html>`, { url })
const canonical = (href: string) => `<link rel="canonical" href="${href}">`
const found = (url: string, head = '') =>
  detectAll(rule, evidenceOf(page(url, head))).map((finding) => finding.values?.canonical)

describe('pagination-canonical', () => {
  it('fails the wrong fixture: page 2 whose canonical is page 1', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence).map((finding) => finding.message)).toEqual([
      'canonical-elsewhere',
    ])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it.each([
    ['https://shop.example/oud?page=2'],
    ['https://shop.example/oud?paged=3'],
    ['https://shop.example/oud?p=2&sort=price'],
    ['https://shop.example/oud/page/2'],
    ['https://shop.example/oud/page/12/'],
  ])('%s is a later page of a list', (url) => {
    expect(rule.appliesTo(page(url))).toBe(true)
    expect(found(url, canonical('https://shop.example/oud'))).toEqual(['https://shop.example/oud'])
    expect(found(url, canonical(url))).toEqual([])
  })

  it.each([
    ['https://shop.example/oud'],
    ['https://shop.example/oud?page=1'],
    ['https://shop.example/oud?page=abc'],
    ['https://shop.example/pages/about'],
    ['https://shop.example/oud?sort=price'],
  ])('%s is not', (url) => {
    expect(rule.appliesTo(page(url))).toBe(false)
  })

  it('takes a rel=prev link as the mark of a later page', () => {
    const head = '<link rel="prev" href="/oud"><link rel="canonical" href="/oud">'
    expect(rule.appliesTo(page('https://shop.example/oud-more', head))).toBe(true)
    expect(found('https://shop.example/oud-more', head)).toEqual(['https://shop.example/oud'])
    expect(
      rule.appliesTo(page('https://shop.example/oud', '<link rel="next" href="/oud?page=2">')),
    ).toBe(false)
  })

  it('passes a later page without a canonical, and one that is its own whatever its query', () => {
    expect(found('https://shop.example/oud?page=2')).toEqual([])
    expect(
      found('https://shop.example/oud/page/2/', canonical('https://shop.example/oud/page/2')),
    ).toEqual([])
  })
})

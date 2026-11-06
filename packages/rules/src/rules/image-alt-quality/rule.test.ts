import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const page = (...alts: string[]) =>
  htmlPage(
    `<html lang="ar"><body>${alts.map((alt) => `<img src="a.png" alt="${alt}">`).join('')}</body></html>`,
  )
const found = (...alts: string[]) =>
  detectAll(rule, evidenceOf(page(...alts))).map((finding) => [
    finding.message,
    finding.values?.count,
    finding.values?.alt,
  ])

describe('image-alt-quality', () => {
  it('fails the wrong fixture: a file name, a bare word, a description that says it is a picture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence).map((f) => [f.message, f.values?.alt])).toEqual([
      ['filename', 'IMG_2045.jpg'],
      ['generic', 'صورة'],
      ['prefix', 'صورة لعطر العود الملكي'],
    ])
  })

  it('passes the right fixture: a description, and an empty alt for a decoration', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it.each([
    ['IMG_2045.jpg', 'filename'],
    ['photo-1.PNG', 'filename'],
    ['DSC00012', 'filename'],
    ['Screenshot 2026-03-05', 'filename'],
    ['banner.webp', 'filename'],
    ['image', 'generic'],
    ['Photo', 'generic'],
    ['شعار', 'generic'],
    ['صورة', 'generic'],
    ['image of a perfume bottle', 'prefix'],
    ['صورة عن المتجر', 'prefix'],
    ['لقطة لـ المنتج', 'prefix'],
  ])('%s is %s', (alt, kind) => {
    expect(found(alt)[0]?.[0]).toBe(kind)
  })

  it.each([
    'زجاجة عطر',
    'Royal oud perfume, 50 ml',
    'شعار متجر الواحة',
    'صورة الغلاف الجديدة',
    'photographer at work',
  ])('%s is a description', (alt) => {
    expect(found(alt)).toEqual([])
  })

  it('counts each kind and shows the first', () => {
    expect(found('a.jpg', 'b.png', 'image', 'ok one')).toEqual([
      ['filename', 2, 'a.jpg'],
      ['generic', 1, 'image'],
    ])
  })

  it('does not apply to a page with no image text', () => {
    expect(
      rule.appliesTo(
        htmlPage('<html><body><img src="a.png"><img src="b.png" alt=""></body></html>'),
      ),
    ).toBe(false)
  })
})

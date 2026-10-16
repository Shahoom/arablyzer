import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const page = (body: string) => htmlPage(`<html lang="ar"><body>${body}</body></html>`)
const found = (body: string) =>
  detectAll(rule, evidenceOf(page(body))).map((finding) => [
    finding.values?.text,
    finding.values?.count,
  ])

describe('anchor-text-generic', () => {
  it('fails the wrong fixture: «اضغط هنا» twice and "Read more" once', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(
      detectAll(rule, evidence).map((finding) => [finding.values?.text, finding.values?.count]),
    ).toEqual([
      ['اضغط هنا', 2],
      ['Read more', 1],
    ])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it.each([
    'اضغط هنا',
    'اضْغَط هنا',
    'انقر هنا للمزيد',
    'هنا',
    'المزيد',
    'اقرأ المزيد',
    'اقرأ المزيد...',
    'المزيد »',
    'Click here',
    'CLICK HERE!',
    'Read more',
    'read   more',
    'More',
    'Learn more',
    'Link',
    'Details',
  ])('%s is generic', (text) => {
    expect(found(`<a href="/p">${text}</a>`)).toHaveLength(1)
  })

  it.each([
    'عطر العود الملكي',
    'اقرأ المزيد عن العود',
    'Read more about oud',
    'More perfumes',
    'المزيد من العطور',
    'تفاصيل الطلب',
    'اضغط هنا لتحميل الكتالوج',
    '',
  ])('%s is not', (text) => {
    expect(found(`<a href="/p">${text}</a>`)).toEqual([])
  })

  it('judges the text with its images’ alt and leaves out a link whose aria-label says more', () => {
    expect(found('<a href="/p"><img src="x.png" alt="عطر العود"> المزيد</a>')).toEqual([])
    expect(found('<a href="/p" aria-label="المزيد عن العود">المزيد</a>')).toEqual([])
    expect(found('<a href="/p" aria-label="اقرأ المزيد">المزيد</a>')).toHaveLength(1)
  })

  it('counts links, and reports the first with its text as written', () => {
    expect(found('<a href="/a">More</a><a href="/b">more</a><a href="/c">MORE</a>')).toEqual([
      ['More', 3],
    ])
  })

  it('does not judge the areas of an image map, nor apply to a page without links', () => {
    expect(found('<map><area href="/p" alt="هنا"></map>')).toEqual([])
    expect(rule.appliesTo(page('<p>x</p>'))).toBe(false)
  })
})

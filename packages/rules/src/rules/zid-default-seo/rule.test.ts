import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const ZID =
  '<link rel="icon" href="https://media.zid.store/i.png"><script src="https://static.zid.store/js/script_loader.js"></script>'
const page = (head: string, extra = ZID) =>
  htmlPage(`<html lang="ar"><head>${extra}${head}</head><body><p>x</p></body></html>`)
const found = (head: string, extra = ZID) =>
  detectAll(rule, evidenceOf(page(head, extra))).map((finding) => finding.message)

describe('zid-default-seo', () => {
  it('fails the wrong fixture: the title and description Zid writes when none is set', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence).map((finding) => finding.message)).toEqual([
      'title',
      'description',
    ])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('finds each default alone', () => {
    expect(found('<title>demo | متجر إلكتروني</title>')).toEqual(['title'])
    expect(
      found(
        '<title>عطور | الواحة</title><meta name="description" content="اكتشف منتجات وتشكيلات وأحدث عروض demo.">',
      ),
    ).toEqual(['description'])
  })

  it('does not take a title that only has the words in it', () => {
    expect(found('<title>متجر إلكتروني للعطور | الواحة</title>')).toEqual([])
    expect(found('<title>الواحة - متجر إلكتروني</title>')).toEqual([])
  })

  it('does not apply to a page that is not on Zid, or to one with too little to show it', () => {
    expect(rule.appliesTo(page('<title>demo | متجر إلكتروني</title>', ''))).toBe(false)
    expect(
      rule.appliesTo(
        page(
          '<title>x</title>',
          '<script src="https://static.zid.store/js/script_loader.js"></script>',
        ),
      ),
    ).toBe(false)
  })
})

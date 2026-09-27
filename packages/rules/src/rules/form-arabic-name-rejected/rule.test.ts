import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const page = (form: string, lang = 'ar') =>
  htmlPage(`<html lang="${lang}"><body><form>${form}</form></body></html>`)
const detect = (form: string, lang?: string) => detectAll(rule, evidenceOf(page(form, lang)))
const rejected = (form: string) =>
  detect(form).map((finding) => [finding.values?.name, finding.values?.accepted])

describe('form-arabic-name-rejected', () => {
  it('fires on a full name field that allows Latin letters only', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([
      {
        message: 'rejected',
        values: { name: 'محمد العبري', accepted: 'Omar Alabri', pattern: '[A-Za-z ]{3,40}' },
        selector: '#name',
        snippet:
          '<input id="name" name="full_name" autocomplete="name" pattern="[A-Za-z ]{3,40}" required />',
        location: { line: 17, column: 9 },
      },
    ])
  })

  it('fires on an Arabic range that leaves out alef with hamza', async () => {
    const [finding] = detectAll(rule, await fixtureEvidence(rule.id, 'wrong-hamza'))
    expect(finding).toMatchObject({
      message: 'rejected',
      values: { name: 'أحمد', accepted: 'محمد', pattern: '[ا-ي ]+' },
    })
  })

  it('passes open patterns, and fields for user names, cards and names in English', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('finds name fields by autocomplete, name, id, label, aria-label and placeholder', () => {
    const latin = 'pattern="[A-Za-z ]+"'
    for (const field of [
      `<input autocomplete="given-name" ${latin}>`,
      `<input autocomplete="shipping family-name" ${latin}>`,
      `<input name="billing_first_name" ${latin}>`,
      `<input id="lastName" ${latin}>`,
      `<input name="customer[fname]" ${latin}>`,
      `<label>اسمك <input ${latin}></label>`,
      `<input aria-label="Your name" ${latin}>`,
      `<input placeholder="اسم العائلة" ${latin}>`,
    ]) {
      expect(detect(field), field).toHaveLength(1)
    }
  })

  it('leaves out fields that are not for a person’s name, or not text', () => {
    const latin = 'pattern="[A-Za-z ]+"'
    for (const field of [
      `<input name="username" ${latin}>`,
      `<input name="company_name" ${latin}>`,
      `<input autocomplete="cc-name" name="name" ${latin}>`,
      `<input name="name_en" ${latin}>`,
      `<input placeholder="الاسم باللغة الإنجليزية" ${latin}>`,
      `<input placeholder="Name as in passport" ${latin}>`,
      `<input placeholder="اسم الشركة" ${latin}>`,
      `<input name="city" ${latin}>`,
      `<input type="email" name="name" ${latin}>`,
      `<input type="hidden" name="name" value="x" ${latin}>`,
      '<input name="name">',
    ]) {
      expect(detect(field), field).toEqual([])
    }
  })

  it('compares names of the same shape, so limits on length or spaces are not blamed on Arabic', () => {
    expect(rejected('<input name="name" pattern="\\p{L}+">')).toEqual([])
    expect(rejected('<input name="name" pattern=".{5,}">')).toEqual([])
    expect(rejected('<input name="name" pattern="[\\u0621-\\u064A ]+">')).toEqual([])
    expect(rejected('<input name="name" pattern="[A-Za-z]+">')).toEqual([['فاطمة', 'Fatma']])
    expect(rejected('<input name="name" pattern="[ا-ي]+">')).toEqual([['أحمد', 'محمد']])
  })

  it('ignores patterns that do not compile, as browsers do, and those that run too long', () => {
    expect(detect('<input name="name" pattern="[a-z-]+">')).toEqual([])
    expect(detect(`<input name="name" pattern="(${'.*'.repeat(12)})x">`)).toEqual([])
  })

  it('applies to Arabic pages with a name field that has a pattern', () => {
    expect(rule.appliesTo(page('<input name="name" pattern=".+">'))).toBe(true)
    expect(rule.appliesTo(page('<input name="name" pattern=".+">', 'en'))).toBe(false)
    expect(rule.appliesTo(page('<input name="name">'))).toBe(false)
    expect(rule.appliesTo(page('<input name="phone" pattern="[0-9]+">'))).toBe(false)
  })

  it('leaves out patterns far longer than any real one', () => {
    const start = performance.now()
    expect(detect(`<input name="name" pattern="[A-Za-z ]${'+'.repeat(5_000)}">`)).toEqual([])
    expect(performance.now() - start).toBeLessThan(1000)
  })
})

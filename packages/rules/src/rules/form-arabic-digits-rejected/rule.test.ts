import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const page = (form: string, lang = 'ar') =>
  htmlPage(`<html lang="${lang}"><body><form>${form}</form></body></html>`)
const detect = (form: string, lang?: string) => detectAll(rule, evidenceOf(page(form, lang)))
const pairs = (form: string) =>
  detect(form).map((finding) => [finding.values?.western, finding.values?.eastern])

describe('form-arabic-digits-rejected', () => {
  it('fires on a phone field that takes Western digits only, with the placeholder as the example', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([
      {
        message: 'rejected',
        values: { western: '91234567', eastern: '٩١٢٣٤٥٦٧', pattern: '[0-9]{8}' },
        selector: '#phone',
        snippet:
          '<input id="phone" name="phone" type="tel" inputmode="numeric" pattern="[0-9]{8}" placeholder="9xxxxxxx" required />',
        location: { line: 17, column: 9 },
      },
    ])
  })

  it('fires on a one-time code field whose \\d takes Western digits only', async () => {
    const [finding] = detectAll(rule, await fixtureEvidence(rule.id, 'wrong-code'))
    expect(finding).toMatchObject({
      message: 'rejected',
      values: { western: '912345', eastern: '٩١٢٣٤٥', pattern: '\\d{6}' },
    })
  })

  it('passes patterns that take Arabic-Indic digits too, and fields that are not numeric', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('finds numeric fields by inputmode, type, autocomplete or a pattern of digits', () => {
    for (const field of [
      '<input inputmode="decimal" pattern="[0-9.]+">',
      '<input type="tel" pattern="[0-9 ]{8,12}">',
      '<input autocomplete="shipping postal-code" pattern="[0-9]{3}">',
      '<input autocomplete="cc-csc" pattern="[0-9]{3,4}">',
      '<input name="phone" pattern="(\\+968)?[79]\\d{7}">',
      '<input name="pin" type="password" pattern="\\d{4}">',
    ]) {
      expect(detect(field), field).toHaveLength(1)
    }
    for (const field of [
      '<input name="coupon" pattern="[A-Z0-9]{6}">',
      '<input name="phone">',
      '<input type="number" pattern="[0-9]{8}">',
      '<input type="hidden" pattern="[0-9]{8}" value="1">',
    ]) {
      expect(detect(field), field).toEqual([])
    }
  })

  it('builds its example from the placeholder or from digits the pattern starts with', () => {
    expect(pairs('<input type="tel" pattern="05[0-9]{8}">')).toEqual([['0591234567', '٠٥٩١٢٣٤٥٦٧']])
    expect(pairs('<input type="tel" pattern="\\+968[0-9]{8}">')).toEqual([
      ['+96891234567', '+٩٦٨٩١٢٣٤٥٦٧'],
    ])
    expect(
      pairs('<input type="tel" pattern="[0-9]{3}-[0-9]{4}" placeholder="مثال: 123-4567">'),
    ).toEqual([['123-4567', '١٢٣-٤٥٦٧']])
    expect(pairs('<input type="tel" pattern="[0-9]{2} [0-9]{2}" placeholder="xx xx">')).toEqual([
      ['12 34', '١٢ ٣٤'],
    ])
  })

  it('compares like with like: no Western number accepted, or Arabic-Indic ones accepted, is no finding', () => {
    expect(detect('<input type="tel" pattern="[0-9]{3}-[0-9]{4}">')).toEqual([])
    expect(detect('<input type="tel" pattern="[0-9٠-٩]{8}">')).toEqual([])
    expect(detect('<input type="tel" pattern="(\\+968)?\\p{Nd}{8}">')).toEqual([])
    expect(detect('<input type="tel" pattern="[a-z-]+">')).toEqual([])
    expect(detect(`<input type="tel" pattern="(${'\\d*'.repeat(14)})x">`)).toEqual([])
  })

  it('applies to Arabic pages with a numeric field that has a pattern', () => {
    expect(rule.appliesTo(page('<input type="tel" pattern="[0-9]{8}">'))).toBe(true)
    expect(rule.appliesTo(page('<input type="tel" pattern="[0-9]{8}">', 'en'))).toBe(false)
    expect(rule.appliesTo(page('<input type="tel">'))).toBe(false)
  })

  // Independent review, 2026-09-27: patterns and placeholders of hostile length.
  it('stays fast on patterns and placeholders far longer than any real one', () => {
    for (const field of [
      `<input type="tel" pattern="\\d${'\\p{'.repeat(60_000)}">`,
      `<input type="tel" pattern="${'['.repeat(200_000)}">`,
      `<input type="tel" pattern="[0-9]{8}" placeholder="${'('.repeat(200_000)}xa">`,
    ]) {
      const start = performance.now()
      detect(field)
      expect(performance.now() - start, field.slice(0, 40)).toBeLessThan(5000)
    }
  }, 30_000)

  it('still uses the generic numbers when the placeholder is too long to read', () => {
    expect(
      pairs(`<input type="tel" pattern="[0-9]{8}" placeholder="${'x'.repeat(5_000)}">`),
    ).toEqual([['91234567', '٩١٢٣٤٥٦٧']])
  })
})

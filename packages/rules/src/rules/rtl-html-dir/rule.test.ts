import { describe, expect, it } from 'vitest'
import { evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const TEXT = '<p>نشحن الطلبات من مستودعنا في الرياض خلال يومي عمل.</p>'

describe('rtl-html-dir', () => {
  it.each([
    ['wrong', 'missing'],
    ['wrong-body', 'body-only'],
  ])('fires on fixture %s with message %s', async (name, message) => {
    const evidence = await fixtureEvidence(rule.id, name)
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(rule.detect(evidence).map((finding) => finding.message)).toEqual([message])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(rule.detect(evidence)).toEqual([])
  })

  it.each(['ltr', 'auto', 'right'])('fires on dir="%s" and reports it', (dir) => {
    const [finding] = rule.detect(
      evidenceOf(htmlPage(`<html lang="ar" dir="${dir}"><body>${TEXT}</body></html>`)),
    )
    expect(finding).toMatchObject({
      message: 'not-rtl',
      values: { declaredDir: dir },
      selector: 'html',
    })
  })

  it('accepts dir="rtl" in any case and with spaces', () => {
    expect(
      rule.detect(evidenceOf(htmlPage(`<html lang="ar" dir=" RTL "><body>${TEXT}</body></html>`))),
    ).toEqual([])
  })

  it('does not apply to pages that are not mostly Arabic', () => {
    expect(rule.appliesTo(htmlPage('<html lang="en"><p>Shipping from Riyadh: الرياض</p>'))).toBe(
      false,
    )
  })
})

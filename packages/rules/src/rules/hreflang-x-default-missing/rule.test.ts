import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const alt = (code: string) =>
  `<link rel="alternate" hreflang="${code}" href="https://shop.example/${code}">`
const page = (codes: string[], headers: [string, string][] = []) =>
  htmlPage(`<html><head>${codes.map(alt).join('')}</head><body>x</body></html>`, {
    headers: [['content-type', 'text/html'], ...headers],
  })

describe('hreflang-x-default-missing', () => {
  it('fails the wrong fixture and passes the right one', async () => {
    const wrong = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(wrong.page)).toBe(true)
    expect(detectAll(rule, wrong).map((finding) => finding.values?.count)).toEqual([3])
    const right = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(right.page)).toBe(true)
    expect(detectAll(rule, right)).toEqual([])
  })

  it('wants x-default beside two versions or more, in any letter case', () => {
    expect(detectAll(rule, evidenceOf(page(['ar-SA', 'en'])))).toHaveLength(1)
    expect(detectAll(rule, evidenceOf(page(['ar-SA', 'en', 'X-Default'])))).toEqual([])
    expect(detectAll(rule, evidenceOf(page(['ar-SA', 'AR-sa', 'x-default'])))).toEqual([])
  })

  it('counts a Link header’s x-default', () => {
    const header: [string, string] = [
      'link',
      '<https://shop.example/>; rel="alternate"; hreflang="x-default"',
    ]
    expect(detectAll(rule, evidenceOf(page(['ar-SA', 'en'], [header])))).toEqual([])
  })

  it('does not apply to one version, nor to x-default alone', () => {
    expect(rule.appliesTo(page(['ar-SA']))).toBe(false)
    expect(rule.appliesTo(page(['ar-SA', 'AR-SA']))).toBe(false)
    expect(rule.appliesTo(page(['x-default']))).toBe(false)
    expect(rule.appliesTo(page([]))).toBe(false)
  })
})

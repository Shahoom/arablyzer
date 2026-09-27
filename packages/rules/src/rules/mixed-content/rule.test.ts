import { describe, expect, it } from 'vitest'
import { applies, detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const secure = (html: string) => evidenceOf(htmlPage(html, { url: 'https://shop.example/' }))

describe('mixed-content', () => {
  it('fires on an HTTPS page with an image over http:', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong'))).toMatchObject([
      {
        message: 'upgradable',
        values: { tag: 'img', url: 'http://shop.example/images/halwa.jpg' },
        selector: expect.any(String) as string,
      },
    ])
  })

  it('passes the page with its image over https:', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right'))).toEqual([])
  })

  it('tells blocked loads and forms apart', () => {
    const findings = detectAll(
      rule,
      secure(
        '<script src="http://cdn.example/app.js"></script><form action="http://shop.example/join"></form>',
      ),
    )
    expect(findings.map((finding) => finding.message)).toEqual(['blockable', 'form'])
  })

  it('leaves out pages served over plain HTTP', () => {
    const page = htmlPage('<img src="http://cdn.example/a.png">', { url: 'http://shop.example/' })
    expect(applies(rule, evidenceOf(page))).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const inBody = (html: string) =>
  detectAll(rule, evidenceOf(htmlPage(`<html lang="ar"><body>${html}</body></html>`)))
const ARABIC = 'نص عربي طويل بما يكفي ليكون أغلب حروف الصفحة عربية دائماً'

describe('ar-digits-mixed', () => {
  it('fires when an Arabic page writes numbers in Western and Eastern Arabic digits', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([
      {
        message: 'mixed',
        values: { western: '500', eastern: '٤٫٥٠٠', westernCount: 2, easternCount: 2 },
        selector: 'body > main > p:nth-of-type(2)',
        location: { line: 16 },
        key: 'mixed',
      },
    ])
  })

  it('fires on Persian digits in Arabic text', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong-persian'))).toEqual([
      {
        message: 'persian',
        values: { persian: '۴۵۰', persianCount: 2 },
        selector: 'body > main > p:nth-of-type(1)',
        location: { line: 15 },
        key: 'persian',
      },
    ])
  })

  it.each(['right', 'right-eastern'])('passes fixture %s', async (name) => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, name))).toEqual([])
  })

  it('leaves out numbers that belong to Latin words, international phone numbers and code', () => {
    expect(
      inBody(`<p>${ARABIC} ٢٠٢٤، Windows 11 و B2B و +966 50 123 4567 و <code>x = 42</code></p>`),
    ).toEqual([])
  })

  it('counts a number that mixes both sets inside it', () => {
    const [finding] = inBody(`<p>${ARABIC} ٢٠24</p>`)
    expect(finding).toMatchObject({
      message: 'mixed',
      values: { western: '٢٠24', eastern: '٢٠24' },
    })
  })
})

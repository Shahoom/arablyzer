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

  it('leaves out Persian and Urdu pages, whose own digits these are', () => {
    for (const [lang, text] of [
      ['fa', 'قیمت این کالا ۲۵۰ هزار تومان است و ارسال ۳ روز طول می‌کشد، سفارش 2024.'],
      ['ur', 'اس کی قیمت ۲۵۰ روپے ہے اور ترسیل میں ۳ دن لگتے ہیں، آرڈر 2024۔'],
    ] as const) {
      const page = htmlPage(`<html lang="${lang}" dir="rtl"><body><p>${text}</p></body></html>`)
      expect(rule.appliesTo(page), lang).toBe(false)
    }
  })

  it('does not count the year after ©, which themes write in Western digits', () => {
    expect(
      inBody(
        `<p>${ARABIC}: يصل الطلب خلال ٣ أيام بسعر ٥ دنانير.</p><footer>© 2024 جميع الحقوق محفوظة</footer>`,
      ),
    ).toEqual([])
    expect(inBody(`<p>${ARABIC}: يصل الطلب خلال ٣ أيام، والشحن 5 دنانير.</p>`)).toHaveLength(1)
  })
})

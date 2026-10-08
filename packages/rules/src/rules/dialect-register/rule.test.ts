import { describe, expect, it } from 'vitest'
import { applies, detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { dialectOfPage, fitsCountry, readDialect } from '../../lib/dialect'
import { rule } from './rule'

const filler =
  'نقدم لكم أفضل المنتجات والخدمات وهي مصنوعة بعناية من أجود المواد المتوفرة في السوق. '.repeat(9)
const page = (body: string, lang = 'ar') =>
  htmlPage(
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"></head><body>${body}</body></html>`,
  )

describe('dialect-register', () => {
  it('flags a Gulf text on a page written for Egypt, and passes an Egyptian one', async () => {
    const wrong = await fixtureEvidence(rule.id, 'wrong')
    expect(applies(rule, wrong)).toBe(true)
    const findings = detectAll(rule, wrong)
    expect(findings[0]).toMatchObject({
      message: 'contradicts-gulf',
      values: { country: 'EG' },
    })
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right'))).toEqual([])
  })

  it('counts the markers of each dialect and calls Modern Standard what has none', () => {
    expect(readDialect('ازاي نعمل كده دلوقتي عايز اعرف ' + filler).label).toBe('egyptian')
    expect(readDialect('هلق شو بدك تعمل كتير منيح ' + filler).label).toBe('levantine')
    expect(readDialect('بزاف ديال الناس واش كاين هادشي ' + filler).label).toBe('maghrebi')
    expect(readDialect(filler.repeat(2)).label).toBe('msa')
    expect(readDialect('وايد شلون ابغى ' + filler).hits.gulf).toBe(3)
  })

  it('matches however the page spells the hamza, ta marbuta and alef maqsura', () => {
    expect(readDialect('ابغى وايد شلون ' + filler).hits.gulf).toBe(3)
    expect(readDialect('أبغى وايد شلون ' + filler).hits.gulf).toBe(3)
  })

  it('gives no verdict on too little text', () => {
    const reading = readDialect('ازاي كده دلوقتي عايز')
    expect(reading.label).toBeNull()
    expect(rule.appliesTo(page('<p>ازاي كده دلوقتي عايز</p>'))).toBe(false)
  })

  it('does not count a word quoted in guillemets: it is mentioned, not written in', () => {
    expect(readDialect('قال «ازاي» و«دلوقتي» و«عايز» ثلاثاً ' + filler).hits.egyptian).toBe(0)
  })

  it('keeps words two dialects share out of every list', () => {
    for (const word of ['مش', 'شوي', 'وين', 'عشان', 'ليش', 'ماشي', 'دول', 'خالص']) {
      expect(readDialect(word).hits).toEqual({
        msa: 0,
        gulf: 0,
        egyptian: 0,
        levantine: 0,
        maghrebi: 0,
      })
    }
  })

  it('says when the headings and the body speak in different registers', () => {
    const findings = detectAll(
      rule,
      evidenceOf(
        page(
          `<h1>أهلا بكم في موقعنا الرسمي للخدمات الإلكترونية والتجارية</h1><p>ازاي تطلب دلوقتي؟ عايز تعرف كده ازاي؟ ${filler}</p><p>ازاي نخدمك دلوقتي ولسه عايز نعرف.</p>`,
        ),
      ),
    )
    expect(findings.map((f) => f.message)).toContain('register-formal-headings')
  })

  it('knows which dialect belongs to which country', () => {
    expect(fitsCountry('gulf', 'KW')).toBe(true)
    expect(fitsCountry('gulf', 'EG')).toBe(false)
    expect(fitsCountry('msa', 'EG')).toBe(true)
    expect(dialectOfPage([]).whole.label).toBeNull()
  })
})

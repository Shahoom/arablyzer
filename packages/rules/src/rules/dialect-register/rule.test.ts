import type { NlpDialectFacts } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import {
  dialectOfPage,
  effectiveDialect,
  fitsCountry,
  modelVerdict,
  readDialect,
} from '../../lib/dialect'
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

  describe('with the dialect model of the Arabic NLP service', () => {
    const model = (
      label: NlpDialectFacts['label'],
      share: number,
      votes = 0.8,
    ): NlpDialectFacts => {
      const rest = (1 - share) / 4
      const probabilities = {
        msa: rest,
        gulf: rest,
        egyptian: rest,
        levantine: rest,
        maghrebi: rest,
      }
      if (label !== null) probabilities[label] = share
      const chunks = 10
      const won = Math.round(votes * chunks)
      return {
        label,
        probabilities,
        votes: {
          msa: 0,
          gulf: 0,
          egyptian: 0,
          levantine: 0,
          maghrebi: 0,
          ...(label === null ? {} : { [label]: won }),
        },
        chunks,
        words: 200,
        truncated: false,
      }
    }
    // Modern Standard to the word list, on a page that says it is for Egypt (domain, language tag, pounds)
    const egyptPage = htmlPage(
      `<!doctype html><html lang="ar-EG"><head><meta charset="utf-8"></head><body><p>${filler}</p><p>السعر 100 ج.م</p></body></html>`,
      { url: 'https://shop.example.eg/' },
    )

    it('gives a verdict only when it is sure: 70% of the probability and half of the sentences', () => {
      expect(modelVerdict(model('gulf', 0.9), 120)).toMatchObject({ label: 'gulf' })
      expect(modelVerdict(model('gulf', 0.65), 120)).toBeNull()
      expect(modelVerdict(model('gulf', 0.9, 0.3), 120)).toBeNull()
      expect(modelVerdict(model('gulf', 0.9), 40)).toBeNull()
      expect(modelVerdict(model(null, 0), 120)).toBeNull()
      expect(modelVerdict(null, 120)).toBeNull()
    })

    it('reads a dialect where the word list finds Modern Standard, and leaves the word list’s own', () => {
      const msa = readDialect(filler.repeat(2))
      expect(effectiveDialect(msa, model('gulf', 0.9))).toMatchObject({
        label: 'gulf',
        source: 'model',
      })
      expect(effectiveDialect(msa, model('msa', 0.9))).toMatchObject({
        label: 'msa',
        source: 'model',
      })
      expect(effectiveDialect(msa, null)).toMatchObject({ label: 'msa', source: 'lexicon' })
      const egyptian = readDialect('ازاي نعمل كده دلوقتي عايز اعرف ' + filler)
      expect(effectiveDialect(egyptian, model('gulf', 0.95))).toMatchObject({
        label: 'egyptian',
        source: 'lexicon',
      })
    })

    it('names a dialect that is not the country’s when the model is the only one to see it', () => {
      const evidence = {
        ...evidenceOf(egyptPage),
        nlp: { spelling: null, dialect: model('gulf', 0.9) },
      }
      const found = detectAll(rule, evidence)
      expect(found).toEqual([
        expect.objectContaining({ message: 'model-gulf', values: { country: 'EG', percent: 90 } }),
      ])
      // without the service, or with a model that is unsure, the page is Modern Standard: no finding
      expect(detectAll(rule, evidenceOf(egyptPage))).toEqual([])
      expect(
        detectAll(rule, {
          ...evidenceOf(egyptPage),
          nlp: { spelling: null, dialect: model('gulf', 0.6) },
        }),
      ).toEqual([])
      // a dialect that is the country's is nothing to say
      expect(
        detectAll(rule, {
          ...evidenceOf(egyptPage),
          nlp: { spelling: null, dialect: model('egyptian', 0.9) },
        }),
      ).toEqual([])
    })
  })
})

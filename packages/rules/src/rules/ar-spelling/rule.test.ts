import type { NlpFacts, NlpSpelling } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import {
  applies,
  detectAll,
  evidenceOf,
  fixtureEvidence,
  fixtureNlp,
  htmlPage,
} from '../../../test/helpers'
import { rule } from './rule'

const slip = (over: Partial<NlpSpelling> = {}): NlpSpelling => ({
  word: 'الاسعار',
  suggestion: 'الأسعار',
  family: 'hamza',
  confidence: 0.97,
  before: 'تتميز',
  after: 'في متجرنا',
  alternatives: [],
  ...over,
})

const facts = (findings: NlpSpelling[], minConfidence = 0.9): NlpFacts => ({
  spelling: { findings, words: 20, judged: 18, truncated: false, minConfidence },
  dialect: null,
})

const arabic = (body: string, head = '') =>
  htmlPage(
    `<!doctype html><html lang="ar"><head><meta charset="utf-8">${head}</head><body><p>${body}</p></body></html>`,
  )
const TEXT =
  'تتميز الاسعار في متجرنا بالمنافسة طوال العام ونوصل الطلبات إلى جميع المدن خلال أيام قليلة. '.repeat(
    2,
  )

describe('ar-spelling', () => {
  it('flags the slips the service found on the wrong page, and none on the right one', async () => {
    const wrong = {
      ...(await fixtureEvidence(rule.id, 'wrong')),
      nlp: await fixtureNlp(rule.id, 'wrong'),
    }
    expect(applies(rule, wrong)).toBe(true)
    expect(
      detectAll(rule, wrong).map((f) => [f.message, f.values?.word, f.values?.suggestion]),
    ).toEqual([
      ['hamza', 'الاسعار', 'الأسعار'],
      ['ta-marbuta', 'بالمدينه', 'بالمدينة'],
      ['ta-marbuta', 'والخدمه', 'والخدمة'],
    ])
    const right = {
      ...(await fixtureEvidence(rule.id, 'right')),
      nlp: await fixtureNlp(rule.id, 'right'),
    }
    expect(detectAll(rule, right)).toEqual([])
  })

  it('does not apply without the service’s answer, and the engine leaves it out then', () => {
    const page = arabic(TEXT)
    expect(applies(rule, evidenceOf(page))).toBe(false)
    expect(applies(rule, { ...evidenceOf(page), nlp: { spelling: null, dialect: null } })).toBe(
      false,
    )
    expect(
      rule.appliesTo(arabic('<span>hello world, no Arabic here at all</span>'), {
        ...evidenceOf(arabic(TEXT)),
        nlp: facts([slip()]),
      }),
    ).toBe(false)
  })

  it('reports each word once, with how often it is written and the context', () => {
    const evidence = {
      ...evidenceOf(arabic(TEXT)),
      nlp: facts([
        slip(),
        slip(),
        slip({ word: 'المدرسه', suggestion: 'المدرسة', family: 'ta-marbuta', confidence: 0.95 }),
      ]),
    }
    const found = detectAll(rule, evidence)
    expect(found).toHaveLength(2)
    expect(found[0]).toMatchObject({
      message: 'hamza',
      values: { count: 2, confidence: 97 },
      snippet: 'تتميز الاسعار في متجرنا',
    })
  })

  it('leaves out a word that is part of the site’s own brand name', () => {
    const head =
      '<title>الاسعار الذهبية</title><meta property="og:site_name" content="الاسعار الذهبية">'
    const evidence = { ...evidenceOf(arabic(TEXT, head)), nlp: facts([slip()]) }
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('keeps below its threshold what the service reported under it', () => {
    const evidence = { ...evidenceOf(arabic(TEXT)), nlp: facts([slip({ confidence: 0.8 })], 0.9) }
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('reports twenty words at most', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      slip({ word: `كلمة${'ا'.repeat(i + 1)}`, suggestion: 'كلمة' }),
    )
    expect(detectAll(rule, { ...evidenceOf(arabic(TEXT)), nlp: facts(many) })).toHaveLength(20)
  })
})

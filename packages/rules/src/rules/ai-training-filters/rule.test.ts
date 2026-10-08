import { describe, expect, it } from 'vitest'
import { applies, detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { FINEWEB2, readTraining, tokenize, trainingText } from '../../lib/ai-training'
import { rule } from './rule'

const page = (body: string) =>
  htmlPage(
    `<!doctype html><html lang="ar"><head><meta charset="utf-8"></head><body>${body}</body></html>`,
  )
const result = (text: string, id: string) =>
  readTraining(text).checks.find((item) => item.id === id)

describe('ai-training-filters', () => {
  it('fails a page that repeats one line, and names the filters that fail', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(applies(rule, evidence)).toBe(true)
    const messages = detectAll(rule, evidence).map((finding) => finding.message)
    expect(messages).toContain('repetition')
    expect(messages).toContain('repeated-lines')
  })

  it('passes a page of ordinary Arabic prose', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    const reading = readTraining(trainingText(evidence.page))
    expect(reading.checks.filter((item) => item.applied && !item.pass)).toEqual([])
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('takes its thresholds from the arb_Arab config of FineWeb-2', () => {
    expect(FINEWEB2.languageScore).toBe(0.711)
    expect(FINEWEB2.dupLineFrac).toBe(0.304)
    expect(FINEWEB2.topNGrams).toEqual([
      [2, 0.197],
      [3, 0.172],
      [4, 0.146],
    ])
    expect(FINEWEB2.dupNGrams[5]).toEqual([10, 0.109])
    expect(FINEWEB2.linePunctThr).toBe(0.143)
    expect(FINEWEB2.newLineRatio).toBe(0.189)
    expect(FINEWEB2.maxNonAlphaWordsRatio).toBe(0.787)
    expect(FINEWEB2.maxAvgWordLength).toBe(9)
    expect(FINEWEB2.stopWords).toHaveLength(19)
  })

  it('counts duplicate lines as datatrove does: the repeats, over all the lines', () => {
    const text = ['أ ب ج.', 'د هـ و.', 'أ ب ج.', 'أ ب ج.', 'ز ح ط.'].join('\n')
    expect(result(text, 'dup_line_frac')?.measured).toBe(0.4)
    expect(result(text, 'dup_line_frac')?.pass).toBe(false)
  })

  it('measures the share of lines that end in terminal punctuation', () => {
    const text = ['جملة كاملة هنا.', 'عنوان بلا نقطة', 'سؤال هنا؟', 'قائمة', 'نهاية!'].join('\n')
    expect(result(text, 'line_punct_ratio')?.measured).toBe(0.6)
    expect(result('عنوان\nقائمة\nعنصر', 'line_punct_ratio')?.pass).toBe(false)
  })

  it('needs two of the Arabic stop words, and 50 words, as the Gopher filter does', () => {
    expect(result('في الدار كتاب جميل', 'gopher_enough_stop_words')?.measured).toBe(1)
    expect(result('في الدار كتاب من ورق', 'gopher_enough_stop_words')?.pass).toBe(true)
    expect(result('كلمة واحدة فقط', 'gopher_short_doc')?.pass).toBe(false)
  })

  it('tokenizes as spaCy does: punctuation apart from the words', () => {
    expect(tokenize('العروض، الخاصة!')).toEqual(['العروض', '،', 'الخاصة', '!'])
  })

  it('is not applicable to a text shorter than 50 words', () => {
    expect(
      rule.appliesTo(page('<p>نص قصير جداً في الصفحة</p>'), evidenceOf(page('<p>نص قصير</p>'))),
    ).toBe(false)
  })

  it('leaves the navigation and footer out of the text it judges', () => {
    const text = trainingText(
      page(
        '<nav><a>الرئيسية</a></nav><main><p>نص الصفحة الأساسي هنا.</p></main><footer><p>حقوق</p></footer>',
      ),
    )
    expect(text).toBe('نص الصفحة الأساسي هنا.')
  })
})

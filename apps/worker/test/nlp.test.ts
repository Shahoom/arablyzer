import { forgetNlpFailures } from '@arablyzer/collectors'
import { serveNlpWith, type NlpStandIn } from '@arablyzer/fixtures'
import { afterEach, describe, expect, it } from 'vitest'
import { nlpTextHandler } from '../src/nlp'

let stand: NlpStandIn | undefined
afterEach(async () => {
  await stand?.close()
  stand = undefined
  forgetNlpFailures()
})

async function service(
  answers: Record<string, unknown>,
  status = 200,
): Promise<{ url: string; asked: unknown[] }> {
  const asked: unknown[] = []
  stand = await serveNlpWith((path, body) => {
    asked.push({ path, ...body })
    return { status, body: answers[path] ?? {} }
  })
  return { url: stand.url, asked }
}

const SPELL = {
  min_confidence: 0.7,
  words: 4,
  judged: 4,
  truncated: false,
  findings: [
    {
      word: 'الاسعار',
      suggestion: 'الأسعار',
      family: 'hamza',
      confidence: 0.97,
      before: 'تتميز',
      after: 'في',
      alternatives: [],
    },
    {
      word: 'مناسبه',
      suggestion: 'مناسبة',
      family: 'ta-marbuta',
      confidence: 0.74,
      before: 'سعر',
      after: 'جدا',
      alternatives: ['مناسب'],
    },
  ],
}
const DIALECT = {
  label: 'egyptian',
  probabilities: { msa: 0.05, gulf: 0.05, egyptian: 0.8, levantine: 0.05, maghrebi: 0.05 },
  votes: { msa: 0, gulf: 0, egyptian: 2, levantine: 0, maghrebi: 0 },
  chunks: 2,
  words: 30,
  truncated: false,
}

describe('the worker’s text check', () => {
  it('asks for spelling at the sensitivity the visitor chose, and answers in whole percents', async () => {
    const { url, asked } = await service({ '/spell': SPELL })
    const handle = nlpTextHandler({ url })
    const sure = await handle({ kind: 'spelling', texts: ['نص'], sensitivity: 'sure' })
    const wide = await handle({ kind: 'spelling', texts: ['نص'], sensitivity: 'wide' })
    expect(asked).toMatchObject([
      { path: '/spell', min_confidence: 0.9 },
      { path: '/spell', min_confidence: 0.7 },
    ])
    expect(wide).toMatchObject({
      ok: true,
      answer: {
        kind: 'spelling',
        minConfidence: 70,
        findings: [{ confidence: 97 }, { confidence: 74, alternatives: ['مناسب'] }],
      },
    })
    expect(sure.ok).toBe(true)
  })

  it('gives the dialect model’s reading', async () => {
    const { url, asked } = await service({ '/dialect': DIALECT })
    const result = await nlpTextHandler({ url })({
      kind: 'dialect',
      texts: ['نص'],
      sensitivity: 'sure',
    })
    expect(asked).toMatchObject([{ path: '/dialect' }])
    expect(result).toEqual({
      ok: true,
      answer: {
        kind: 'dialect',
        label: 'egyptian',
        probabilities: { msa: 5, gulf: 5, egyptian: 80, levantine: 5, maghrebi: 5 },
        votes: { msa: 0, gulf: 0, egyptian: 2, levantine: 0, maghrebi: 0 },
        chunks: 2,
        words: 30,
        truncated: false,
      },
    })
  })

  it('answers that the service is away, rather than failing, when it errors or is not there', async () => {
    const { url } = await service({}, 503)
    expect(
      await nlpTextHandler({ url })({ kind: 'spelling', texts: ['نص'], sensitivity: 'sure' }),
    ).toEqual({ ok: false })
    forgetNlpFailures()
    expect(
      await nlpTextHandler({ url: 'http://127.0.0.1:9' })({
        kind: 'dialect',
        texts: ['نص'],
        sensitivity: 'sure',
      }),
    ).toEqual({ ok: false })
  })
})

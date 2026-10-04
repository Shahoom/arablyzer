import type { SuggestFacts } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { keyTerms, misspellings, pageWords, writes } from '../../lib/spelling-variants'
import type { Evidence } from '../../rule'
import { rule } from './rule'

const suggest: SuggestFacts = {
  outcome: 'checked',
  calls: 6,
  stopped: false,
  terms: [
    {
      term: 'قهوة',
      written: true,
      variants: [
        { text: 'قهوه', kind: 'ta-marbuta', typed: true, suggestion: 'قهوه سريعه', covered: false },
        { text: 'qahwa', kind: 'arabizi', typed: true, suggestion: 'qahwa coffee', covered: true },
        { text: 'قهو', kind: 'drop', typed: false, suggestion: null, covered: false },
        { text: 'قوهة', kind: 'swap', typed: null, suggestion: null, covered: false },
      ],
    },
  ],
}
const withSuggest = async (facts: SuggestFacts): Promise<Evidence> => ({
  ...(await fixtureEvidence(rule.id, 'wrong')),
  outside: { suggest: facts },
})

describe('misspellings-uncovered', () => {
  it('names each misspelling people type and the page does not write', async () => {
    const evidence = await withSuggest(suggest)
    expect(applies(rule, evidence)).toBe(true)
    const findings = detectAll(rule, evidence)
    expect(findings.map((finding) => finding.message)).toEqual(['typed-ta-marbuta'])
    expect(findings[0]?.values).toEqual({ term: 'قهوة', variant: 'قهوه', suggestion: 'قهوه سريعه' })
  })

  it('passes when everything people type is written, and when nothing was asked', async () => {
    expect(detectAll(rule, await withSuggest({ ...suggest, terms: [] }))).toEqual([])
    expect(applies(rule, await withSuggest({ outcome: 'failed' }))).toBe(false)
    expect(applies(rule, await withSuggest({ outcome: 'no-terms' }))).toBe(false)
    expect(applies(rule, await fixtureEvidence(rule.id, 'right'))).toBe(false)
  })
})

describe('the misspellings of an Arabic word', () => {
  const kinds = (word: string) =>
    Object.fromEntries(misspellings(word).map((item) => [item.text, item.kind]))

  it('makes the ta marbuta, hamza, alef maqsura and Arabizi forms', () => {
    expect(kinds('قهوة')).toMatchObject({ قهوه: 'ta-marbuta' })
    expect(kinds('مدرسة')).toMatchObject({ مدرسه: 'ta-marbuta' })
    expect(kinds('أحمد')).toMatchObject({ احمد: 'hamza', إحمد: 'hamza' })
    expect(kinds('إسلام')).toMatchObject({ اسلام: 'hamza' })
    expect(kinds('مستشفى')).toMatchObject({ مستشفي: 'ya' })
    expect(kinds('على')).toMatchObject({ علي: 'ya' })
    expect(kinds('حليب')).toMatchObject({ hlib: 'arabizi', '7lib': 'arabizi' })
  })

  it('spells a word in Latin letters and in digits', () => {
    const forms = misspellings('خالد')
      .filter((item) => item.kind === 'arabizi')
      .map((item) => item.text)
    expect(forms).toEqual(['khald', '5ald'])
  })

  it('drops and swaps inner letters, never the first or the last', () => {
    const forms = misspellings('مكتبة')
    expect(
      forms
        .filter((item) => item.kind === 'drop')
        .every((item) => item.text.startsWith('م') && item.text.endsWith('ة')),
    ).toBe(true)
    expect(forms.some((item) => item.kind === 'swap')).toBe(true)
    expect(new Set(forms.map((item) => item.text)).size).toBe(forms.length)
  })
})

describe('the key terms of a page', () => {
  const page = htmlPage(
    '<!doctype html><html lang="ar"><head><title>متجر الواحة | قهوة مختصة</title></head><body><h1>أفضل قهوة مختصة محمصة</h1><p>نحمص القهوة طازجة كل أسبوع.</p></body></html>',
  )

  it('takes the words of the h1 and then the title, not the generic ones', () => {
    expect(keyTerms(page)).toEqual(['أفضل', 'قهوة', 'مختصة'])
    expect(keyTerms(page, 1)).toEqual(['أفضل'])
  })

  it('knows which spellings the page writes', () => {
    const words = pageWords(page)
    expect(writes(words, 'قهوة')).toBe(true)
    expect(writes(words, 'قهوه')).toBe(false)
    expect(writes(words, 'Qahwa')).toBe(false)
  })
})

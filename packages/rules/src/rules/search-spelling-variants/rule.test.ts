import type { SearchFacts, SearchVariantResult, SearchWordResult } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, evidenceOf, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const page = htmlPage('<html lang="ar"><body><h1>مكتبة النور</h1></body></html>')

const variant = (
  kind: SearchVariantResult['kind'],
  outcome: SearchVariantResult['outcome'],
  results: number | null,
): SearchVariantResult => ({
  kind,
  query: `q-${kind}`,
  status: 200,
  results,
  first: null,
  counted: kind !== 'arabizi',
  outcome,
})
const word = (
  text: string,
  base: number | null,
  ...variants: SearchVariantResult[]
): SearchWordResult => ({
  word: text,
  base: { query: text, status: 200, results: base, first: null },
  variants,
})
const tested = (...words: SearchWordResult[]): SearchFacts => ({
  outcome: 'tested',
  via: 'form',
  url: 'https://shop.example/',
  param: 's',
  requests: 9,
  words,
})
const evidence = (search: SearchFacts) => ({ ...evidenceOf(page), search })

// The engine's tests serve a site whose search answers; here the detector reads what came back.
describe('search-spelling-variants', () => {
  it('says how many variants were lost, and lists each, by its kind', () => {
    const found = detectAll(
      rule,
      evidence(
        tested(
          word(
            'مكتبة',
            8,
            variant('ta-marbuta', 'lost', 0),
            variant('tatweel', 'same', 8),
            variant('alef', 'lost', 2),
          ),
          word('كتاب', 5, variant('ya', 'differs', 4), variant('digits', 'lost', 0)),
        ),
      ),
    )
    expect(found.map((finding) => finding.message)).toEqual([
      'loses',
      'lost-ta-marbuta',
      'lost-alef',
      'lost-digits',
    ])
    expect(found[0]?.values).toMatchObject({ lost: 3, total: 5 })
    expect(found[1]?.values).toEqual({ word: 'مكتبة', query: 'q-ta-marbuta', found: 0, wanted: 8 })
  })

  it('passes a search that keeps every variant, and shows an Arabizi form without counting it', () => {
    const search = tested(
      word(
        'مكتبة',
        8,
        variant('ta-marbuta', 'same', 8),
        variant('ya', 'differs', 7),
        variant('arabizi', 'lost', 0),
      ),
    )
    expect(detectAll(rule, evidence(search))).toEqual([])
    expect(applies(rule, evidence(search))).toBe(true)
  })

  it('does not judge a word whose own spelling found nothing, or a variant with no answer', () => {
    const search = tested(
      word('نادر', 0, variant('ya', 'lost', 0)),
      word('مكتبة', 8, variant('alef', 'unanswered', null)),
    )
    expect(detectAll(rule, evidence(search))).toEqual([])
    expect(applies(rule, evidence(search))).toBe(false)
  })

  it('applies only to a search that was asked', () => {
    for (const search of [
      { outcome: 'not-found' },
      { outcome: 'robots', via: 'form', url: 'https://shop.example/' },
      { outcome: 'unreachable', via: 'form', url: 'https://shop.example/' },
    ] as const) {
      expect(applies(rule, evidence(search))).toBe(false)
      expect(detectAll(rule, evidence(search))).toEqual([])
    }
    expect(applies(rule, evidenceOf(page))).toBe(false)
  })
})

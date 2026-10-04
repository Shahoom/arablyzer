import { describe, expect, it } from 'vitest'
import { drawnWithLetterSpacing, lettersApart } from '../src/lib/arabic'

const visible = (text: string) => text.replaceAll('‍', '+').replaceAll(' ', '_')
/** The pieces as one line: `+` a joiner, `_` where the page puts its gap. */
const slots = (pieces: readonly (string | null)[]) =>
  pieces
    .map((piece) => piece ?? '_')
    .join('')
    .replaceAll('‍', '+')

describe('lettersApart', () => {
  it('puts a gap slot between letters, with the joiners on the letters beside it', () => {
    expect(slots(lettersApart('متجر العطور'))).toBe('م+_+ت+_+ج+_+ر ا_ل+_+ع+_+ط+_+و_ر')
  })

  it('gives the page one piece for each letter and one for each gap', () => {
    expect(lettersApart('دار')).toEqual(['د', null, 'ا', null, 'ر'])
    expect(lettersApart('م')).toEqual(['م'])
    expect(lettersApart('')).toEqual([])
  })

  it('makes the string drawnWithLetterSpacing writes, a fixed gap in each slot', () => {
    for (const text of ['متجر العطور', 'سماء', 'مُحمد', 'Google والزبون']) {
      const filled = lettersApart(text)
        .map((piece) => piece ?? ' ')
        .join('')
      expect(filled).toBe(drawnWithLetterSpacing(text))
    }
  })
})

describe('drawnWithLetterSpacing', () => {
  it('keeps joined shapes and opens a gap between letters, as the approved design draws it', () => {
    expect(visible(drawnWithLetterSpacing('متجر العطور'))).toBe('م+_+ت+_+ج+_+ر ا_ل+_+ع+_+ط+_+و_ر')
  })

  it('does not join after letters that join only to the letter before them', () => {
    expect(visible(drawnWithLetterSpacing('دار'))).toBe('د_ا_ر')
    expect(visible(drawnWithLetterSpacing('سماء'))).toBe('س+_+م+_+ا_ء')
  })

  it('keeps a vowel sign on its letter', () => {
    expect(visible(drawnWithLetterSpacing('مُحمد'))).toBe('مُ+_+ح+_+م+_+د')
  })
})

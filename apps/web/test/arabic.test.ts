import { describe, expect, it } from 'vitest'
import { drawnWithLetterSpacing } from '../src/lib/arabic'

const visible = (text: string) => text.replaceAll('\u200d', '+').replaceAll('\u202f', '_')

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

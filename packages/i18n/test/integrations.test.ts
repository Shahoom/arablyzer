import { describe, expect, it } from 'vitest'
import { INTEGRATIONS_UI } from '../src/integrations'

const ARABIC = /[؀-ۿ]/

/** Every string in a tree, calling the functions with sample numbers and words. */
function strings(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return [[path, value]]
  if (typeof value === 'function') {
    const call = value as (...args: unknown[]) => unknown
    return [[path, String(call(2, 'critical', 3))]]
  }
  if (Array.isArray(value))
    return value.flatMap((item, i) => strings(item, `${path}[${String(i)}]`))
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, item]) => strings(item, `${path}.${key}`))
  }
  return []
}

describe('the integrations’ copy (the Action and the Chrome extension)', () => {
  it('is waiting for the owner’s review, as every new Arabic string is', () => {
    expect(INTEGRATIONS_UI.reviewed).toBe(false)
  })

  it('has the same strings in both languages, none empty, the Arabic in Arabic', () => {
    const ar = strings(INTEGRATIONS_UI.ar)
    const en = strings(INTEGRATIONS_UI.en)
    expect(ar.map(([path]) => path)).toEqual(en.map(([path]) => path))
    for (const [path, text] of ar) {
      expect(text.trim(), `ar${path}`).not.toBe('')
    }
    for (const [path, text] of en) {
      expect(text.trim(), `en${path}`).not.toBe('')
      expect(ARABIC.test(text), `en${path} has Arabic`).toBe(false)
    }
    // Arabic prose has Arabic in it (a few labels are only a name or a symbol).
    const prose = ar.filter(([, text]) => text.length > 30)
    expect(prose.length).toBeGreaterThan(20)
    for (const [path, text] of prose) expect(ARABIC.test(text), `ar${path}`).toBe(true)
  })

  it('fits the Chrome Web Store: a name up to 75 characters, a description up to 132', () => {
    for (const lang of ['ar', 'en'] as const) {
      const { name, description } = INTEGRATIONS_UI[lang].extension
      expect(name.length).toBeLessThanOrEqual(75)
      expect(description.length).toBeLessThanOrEqual(132)
    }
  })

  it('writes counts in plain digits, as the rest of the site does', () => {
    for (const lang of ['ar', 'en'] as const) {
      expect(INTEGRATIONS_UI[lang].action.score(72)).toContain('72')
      expect(INTEGRATIONS_UI[lang].extension.popup.scoreOf(72)).toContain('72')
    }
  })

  it('counts in Arabic as Arabic does, and in English in the singular for one', () => {
    const ar = INTEGRATIONS_UI.ar
    expect([1, 2, 5, 12].map(ar.extension.popup.occurrences)).toEqual([
      'موضع واحد',
      'موضعان',
      '5 مواضع',
      '12 موضعاً',
    ])
    expect([1, 2, 7, 15].map(ar.action.moreIssues)).toEqual([
      'وفي التقرير الكامل قاعدة أخرى.',
      'وفي التقرير الكامل قاعدتان أخريان.',
      'وفي التقرير الكامل 7 قواعد أخرى.',
      'وفي التقرير الكامل 15 قاعدة أخرى.',
    ])
    expect([1, 2, 30].map(ar.action.retryAfter)).toEqual([
      'حاول بعد ثانية واحدة.',
      'حاول بعد ثانيتين.',
      'حاول بعد 30 ثانية.',
    ])
    const en = INTEGRATIONS_UI.en
    expect([1, 3].map(en.extension.popup.occurrences)).toEqual(['1 place', '3 places'])
    expect([1, 3].map(en.action.moreIssues)).toEqual([
      '1 more rule is in the full report.',
      '3 more rules are in the full report.',
    ])
    expect(en.action.gate.failed(1, 'serious')).toBe(
      'The check fails: 1 finding at serious severity or worse.',
    )
  })
})

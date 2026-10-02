import { describe, expect, it } from 'vitest'
import { KNOWLEDGE_UI, SITE } from '../src/index'

// The knowledge hub's copy (M2.6 R5): what it says of a count, in the form each language gives it.

describe('the knowledge hub’s copy', () => {
  it('names what follows the big number of a tile as Arabic counts it', () => {
    const { tool, rule, fix, term } = KNOWLEDGE_UI.ar.browse.tiles
    expect([1, 2, 3, 10, 11, 44, 100].map((n) => tool(n))).toEqual([
      'أداة',
      'أداتان',
      'أدوات',
      'أدوات',
      'أداة',
      'أداة',
      'أداة',
    ])
    expect([1, 2, 3, 61].map((n) => rule(n))).toEqual([
      'قاعدة نفحص بها',
      'قاعدتان نفحص بهما',
      'قواعد نفحص بها',
      'قاعدة نفحص بها',
    ])
    // 11 to 99 take the accusative («15 دليلاً»), 100 and over the nominative.
    expect([1, 2, 5, 15, 100].map((n) => fix(n))).toEqual([
      'دليل لإصلاح رسائل Search Console',
      'دليلان لإصلاح رسائل Search Console',
      'أدلة لإصلاح رسائل Search Console',
      'دليلاً لإصلاح رسائل Search Console',
      'دليل لإصلاح رسائل Search Console',
    ])
    expect([1, 2, 3, 38, 100].map((n) => term(n))).toEqual([
      'مصطلح',
      'مصطلحان',
      'مصطلحات',
      'مصطلحاً',
      'مصطلح',
    ])
  })

  it('names them as English counts them', () => {
    const { tool, rule, fix, term } = KNOWLEDGE_UI.en.browse.tiles
    expect([tool(1), tool(44)]).toEqual(['tool', 'tools'])
    expect([rule(1), rule(61)]).toEqual(['rule we check with', 'rules we check with'])
    expect([fix(1), fix(15)]).toEqual([
      'fix guide for Search Console messages',
      'fix guides for Search Console messages',
    ])
    expect([term(1), term(38)]).toEqual(['glossary term', 'glossary terms'])
  })

  it('says how many results the search found, for a screen reader', () => {
    const { status } = KNOWLEDGE_UI.ar
    expect([0, 1, 2, 3, 10, 19, 100].map((n) => status(n))).toEqual([
      'لا نتائج',
      'نتيجة واحدة',
      'نتيجتان',
      '3 نتائج',
      '10 نتائج',
      '19 نتيجة',
      '100 نتيجة',
    ])
    expect([0, 1, 19].map((n) => KNOWLEDGE_UI.en.status(n))).toEqual([
      'No results',
      '1 result',
      '19 results',
    ])
  })

  it('has the query where the empty state puts it, and the header’s section where the site has it', () => {
    for (const lang of ['ar', 'en'] as const) {
      expect(KNOWLEDGE_UI[lang].none.title.split('{query}')).toHaveLength(2)
      expect(SITE[lang].nav.knowledge).toBe(KNOWLEDGE_UI[lang].title)
    }
  })
})

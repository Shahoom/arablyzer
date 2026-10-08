import { KNOWLEDGE_UI } from '@arablyzer/i18n'
import { STRINGS } from '@arablyzer/seo/strings'
import { describe, expect, it } from 'vitest'
import { knowledgeIndex, knowledgeTotals } from '../src/lib/knowledge'
import {
  countByType,
  dotOf,
  groupsOf,
  GROUP_LIMIT,
  indexItems,
  KNOWLEDGE_TYPES,
  search,
  splitGroup,
  typeFilterOf,
  type KnowledgeItem,
} from '../src/lib/knowledge-search'
import { GUIDES_DATA } from '../src/lib/guide-data'
import { LIBRARY_DATA } from '../src/lib/rule-data'
import { TOOLS_DATA } from '../src/lib/tool-data'

// The knowledge hub (M2.6 R5, R7): its index, built from the registries, its search, and how a group
// of results is split between the rows shown and «show all».

const item = (fields: Partial<KnowledgeItem> & Pick<KnowledgeItem, 'title'>): KnowledgeItem => ({
  type: 'tool',
  href: `/tools/${fields.id ?? 'x'}`,
  text: '',
  tag: '',
  tone: -1,
  alt: '',
  id: 'x',
  ...fields,
})

/** The search over items, as the island makes it: indexed once, then asked. */
function finder(items: readonly KnowledgeItem[], lang: 'ar' | 'en' = 'ar') {
  const index = indexItems(items, (severity) => STRINGS[lang].report.severity[severity])
  return (typed: string) => search(index, typed).map((found) => found.title)
}

describe('the hub’s index', () => {
  for (const lang of ['ar', 'en'] as const) {
    const { items, tones, totals } = knowledgeIndex(lang)

    it(`lists every tool, rule, fix guide and glossary term, as many as the registries hold (${lang})`, () => {
      expect(totals).toEqual({
        tool: TOOLS_DATA.tools.length,
        rule: LIBRARY_DATA.rules.length,
        fix: GUIDES_DATA.fix.length,
        term: GUIDES_DATA.glossary.length,
      })
      expect(items).toHaveLength(totals.tool + totals.rule + totals.fix + totals.term)
      for (const type of KNOWLEDGE_TYPES) {
        expect(items.filter((candidate) => candidate.type === type)).toHaveLength(totals[type])
      }
    })

    it(`links each page once, in the page’s language (${lang})`, () => {
      const hrefs = items.map((candidate) => candidate.href)
      expect(new Set(hrefs).size).toBe(hrefs.length)
      for (const href of hrefs) {
        expect(href, href).toMatch(
          lang === 'ar'
            ? /^\/(?:tools|rules|fix|glossary)\/[a-z0-9-]+$/
            : /^\/en\/(?:tools|rules|fix|glossary)\/[a-z0-9-]+$/,
        )
      }
    })

    it(`gives every row a title and a line of text, and a severity to the rules alone (${lang})`, () => {
      for (const candidate of items) {
        expect(candidate.title.trim(), candidate.href).not.toBe('')
        expect(candidate.text.trim(), candidate.href).not.toBe('')
        expect(candidate.tag.trim(), candidate.href).not.toBe('')
        expect(candidate.alt.trim(), candidate.href).not.toBe('')
        expect(candidate.severity !== undefined, candidate.href).toBe(candidate.type === 'rule')
      }
    })

    it(`colours a tag by an index into the classes the page sends (${lang})`, () => {
      expect(tones.length).toBeGreaterThan(0)
      for (const dot of tones) expect(dot).toMatch(/^bg-[a-z0-9-]+$/)
      for (const candidate of items) {
        expect(candidate.tone, candidate.href).toBeGreaterThanOrEqual(-1)
        expect(candidate.tone, candidate.href).toBeLessThan(tones.length)
        // A glossary term has no category, so no dot.
        expect(candidate.tone === -1, candidate.href).toBe(candidate.type === 'term')
      }
    })
  }

  it('is the same pages in both languages, each with the other language’s title to search by', () => {
    const ar = knowledgeIndex('ar').items
    const en = knowledgeIndex('en').items
    const ids = (items: readonly KnowledgeItem[]) => items.map((candidate) => candidate.id).sort()
    expect(ids(ar)).toEqual(ids(en))
    for (const row of ar) {
      const other = en.find((candidate) => candidate.type === row.type && candidate.id === row.id)
      // The Arabic page carries the English title, and the English page the Arabic one.
      expect(other?.alt.includes(row.title), row.id).toBe(true)
      expect(row.alt.includes(other?.title ?? ''), row.id).toBe(true)
    }
  })

  it('writes the totals the tiles show without a count the registries do not have', () => {
    const { totals } = knowledgeIndex('ar')
    expect(KNOWLEDGE_UI.ar.browse.tiles.tool(totals.tool)).toMatch(/أداة/)
    expect(KNOWLEDGE_UI.en.browse.tiles.fix(totals.fix)).toMatch(/fix guides/)
  })
})

describe('the hub’s search', () => {
  const items = [
    item({ title: 'فحص robots.txt', id: 'robots-check', text: 'هل يمنع الملف زاحف Google؟' }),
    item({
      type: 'rule',
      title: 'تباعد الحروف في النص العربي',
      id: 'ar-letter-spacing',
      text: 'قد يفتح robots فراغات',
      severity: 'moderate',
      tag: 'العرض العربي',
    }),
    item({ title: 'فحص الصفحة', text: 'صفحة عربية', id: 'page-check' }),
    item({ title: 'فحص الأداة', id: 'tool-check', text: 'أَداة بلا تشكيل', alt: 'The tool check' }),
    item({ title: 'مولد رابط واتساب', id: 'wa', text: 'رقم', tag: 'النماذج' }),
    item({ title: 'تطويل الكلمات', id: 'tatweel', text: 'خــط ممدود', tag: 'المحتوى العربي' }),
  ]
  const find = finder(items)

  it('finds everything for nothing typed, and nothing for words that are nowhere', () => {
    expect(find('')).toHaveLength(items.length)
    expect(find('   ')).toHaveLength(items.length)
    expect(find('zzzqx')).toEqual([])
  })

  it('wants every word, in any case', () => {
    expect(find('ROBOTS')).toHaveLength(2)
    expect(find('robots google')).toEqual(['فحص robots.txt'])
    expect(find('robots واتساب')).toEqual([])
  })

  it('reads the hamza forms of alef, taa marbuta, alef maqsura, tatweel and the diacritics as people type', () => {
    // «الأداة» is written أ in the title and typed ا; «صفحة» with taa marbuta, typed with haa.
    expect(find('الاداة')).toContain('فحص الأداة')
    expect(find('اداه')).toContain('فحص الأداة')
    expect(find('صفحه')).toEqual(['فحص الصفحة'])
    expect(find('اداة')).toContain('فحص الأداة')
    // Diacritics typed or written: «أَداة» in a line of text.
    expect(find('أداة')).toContain('فحص الأداة')
    expect(find('خط')).toEqual(['تطويل الكلمات'])
    expect(find('خُطّ')).toEqual(['تطويل الكلمات'])
  })

  it('reads the other language’s title, the id, the tag and a rule’s severity too', () => {
    expect(find('tool check')).toEqual(['فحص الأداة'])
    expect(find('ar-letter')).toEqual(['تباعد الحروف في النص العربي'])
    expect(find('نماذج')).toEqual(['مولد رابط واتساب'])
    expect(find('متوسط')).toEqual(['تباعد الحروف في النص العربي'])
    expect(finder(items, 'en')('moderate')).toEqual(['تباعد الحروف في النص العربي'])
  })

  it('puts the pages whose names have every word before those that only mention them', () => {
    // The checker is named «robots»; the rule only has the word in its text, though it comes
    // first in the index's order.
    expect(find('robots')).toEqual(['فحص robots.txt', 'تباعد الحروف في النص العربي'])
    const reversed = finder([...items].reverse())
    expect(reversed('robots')).toEqual(['فحص robots.txt', 'تباعد الحروف في النص العربي'])
  })

  it('counts the matches of each kind, and groups them in the page’s order of kinds', () => {
    const index = indexItems(items, () => '')
    const found = search(index, 'عرب')
    expect(countByType(found)).toEqual({ all: found.length, tool: 2, rule: 1, fix: 0, term: 0 })
    expect(groupsOf(found, 'all').map((group) => group.type)).toEqual(['tool', 'rule'])
    expect(groupsOf(found, 'rule').map((group) => group.items.length)).toEqual([1])
    expect(groupsOf(found, 'fix')).toEqual([])
  })

  it('reads a kind from the address, and none for a word that is not one', () => {
    expect(typeFilterOf('rule')).toBe('rule')
    expect(typeFilterOf('term')).toBe('term')
    expect(typeFilterOf('all')).toBe('all')
    expect(typeFilterOf('tools')).toBe('all')
    expect(typeFilterOf(null)).toBe('all')
  })

  it('finds the registries’ own pages as people look for them', () => {
    const { items: real } = knowledgeIndex('ar')
    const found = finder(real)
    // The robots.txt checker before the rules and the guides that only mention robots.txt.
    const robots = search(
      indexItems(real, () => ''),
      'robots',
    )
    expect(robots[0]?.type).toBe('tool')
    expect(robots.some((row) => row.type === 'rule')).toBe(true)
    expect(robots.some((row) => row.type === 'fix')).toBe(true)
    // A Search Console message, in the words of the other language.
    expect(found('Soft 404').length).toBeGreaterThan(0)
    // «ال» is read with or without.
    expect(found('الاتجاه').length).toBe(found('اتجاه').length)
  })
})

describe('the hub’s groups (M2.6 R7)', () => {
  const rows = (count: number) => Array.from({ length: count }, (_, position) => position)

  it('shows the first rows of a long group and keeps the rest, in order, behind «show all»', () => {
    const long = splitGroup(rows(44))
    expect(long.shown).toEqual(rows(GROUP_LIMIT))
    expect(long.rest).toEqual(rows(44).slice(GROUP_LIMIT))
    expect([...long.shown, ...long.rest]).toEqual(rows(44))
    expect(splitGroup(rows(10), 3)).toEqual({ shown: [0, 1, 2], rest: [3, 4, 5, 6, 7, 8, 9] })
  })

  it('shows whole a group that is a row or two over the limit, and one that is under it', () => {
    // A control that reveals one more row costs more than the row.
    for (const count of [0, 1, GROUP_LIMIT, GROUP_LIMIT + 1, GROUP_LIMIT + 2]) {
      expect(splitGroup(rows(count)), String(count)).toEqual({ shown: rows(count), rest: [] })
    }
    expect(splitGroup(rows(GROUP_LIMIT + 3)).rest).toHaveLength(3)
  })

  it('holds the registries’ groups to the limit: each of the hub’s four is long enough to split', () => {
    const totals = knowledgeTotals()
    for (const type of KNOWLEDGE_TYPES) {
      expect(totals[type], type).toBeGreaterThan(GROUP_LIMIT + 2)
    }
  })

  it('totals what the registries hold, the same as the index counts', () => {
    expect(knowledgeTotals()).toEqual({
      tool: TOOLS_DATA.tools.length,
      rule: LIBRARY_DATA.rules.length,
      fix: GUIDES_DATA.fix.length,
      term: GUIDES_DATA.glossary.length,
    })
    for (const lang of ['ar', 'en'] as const) {
      expect(knowledgeIndex(lang).totals).toEqual(knowledgeTotals())
    }
  })

  it('draws a row’s dot in its category’s colour, and a quiet one for a term', () => {
    const tones = ['bg-cat-render', 'bg-serious']
    expect(dotOf(0, tones)).toBe('bg-cat-render')
    expect(dotOf(1, tones)).toBe('bg-serious')
    // A term has no category (tone -1), and a tone with no colour never leaves a row bare.
    expect(dotOf(-1, tones)).toBe('bg-field')
    expect(dotOf(7, tones)).toBe('bg-field')
  })
})

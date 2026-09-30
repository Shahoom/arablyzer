import { KEBAB_ID } from '@arablyzer/report-schema'
import { ruleById } from '@arablyzer/rules'
import { TOOL_DEFINITIONS } from '@arablyzer/tools/registry'
import { describe, expect, it } from 'vitest'
import { FIX_GUIDES, GLOSSARY, type DocumentCopy, type Lang } from '../src/index'

const ARABIC_LETTER = /(?=\p{L})\p{Script=Arabic}/u
const DIRECTIONAL_MARKS = /[‎‏؜‪-‮⁦-⁩]/u
const TOOL_SLUGS = new Set(TOOL_DEFINITIONS.map((tool) => tool.slug))
const GUIDE_SLUGS = new Set(FIX_GUIDES.map((guide) => guide.slug))
const TERM_SLUGS = new Set(GLOSSARY.map((term) => term.slug))

/** What every page of either kind needs: Arabic in Arabic, a description, a source, no marks. */
function checkCopy(copy: Readonly<Record<Lang, DocumentCopy<string>>>) {
  expect(copy.ar.title).toMatch(ARABIC_LETTER)
  expect(copy.ar.description).toMatch(ARABIC_LETTER)
  expect(typeof copy.ar.reviewed).toBe('boolean')
  for (const lang of ['ar', 'en'] as const) {
    const { description, sections, title } = copy[lang]
    // A meta description long enough to say something, short enough to be shown whole.
    expect(description.length, `${lang} description`).toBeGreaterThanOrEqual(80)
    expect(description.length, `${lang} description`).toBeLessThanOrEqual(175)
    expect(sections.references, `${lang} references`).toMatch(/\]\(https:\/\//)
    const text = [title, description, ...Object.values(sections)].join('\n')
    expect(DIRECTIONAL_MARKS.test(text), `${lang}: directional marks`).toBe(false)
  }
  expect(copy.en.faq).toHaveLength(copy.ar.faq.length)
  expect(Object.keys(copy.en.sections)).toEqual(Object.keys(copy.ar.sections))
}

function checkDate(updated: string) {
  expect(updated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(Date.parse(`${updated}T00:00:00+14:00`)).toBeLessThanOrEqual(Date.now())
}

describe('every /fix guide', () => {
  it('has a unique ASCII slug', () => {
    const slugs = FIX_GUIDES.map((guide) => guide.slug)
    for (const slug of slugs) expect(slug).toMatch(KEBAB_ID)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  describe.each(FIX_GUIDES.map((guide) => [guide.slug, guide] as const))('%s', (_slug, guide) => {
    it('is titled with the message as the report writes it, in each language', () => {
      for (const lang of ['ar', 'en'] as const) {
        expect(guide.copy[lang].title).toContain(guide.message[lang])
      }
    })

    it('links to tools, rules and guides that exist', () => {
      for (const tool of guide.tools) expect(TOOL_SLUGS.has(tool), tool).toBe(true)
      for (const rule of guide.rules) expect(ruleById(rule), rule).toBeDefined()
      for (const other of guide.related) {
        expect(other).not.toBe(guide.slug)
        expect(GUIDE_SLUGS.has(other), other).toBe(true)
      }
    })

    it('has its copy in both languages', () => {
      checkCopy(guide.copy)
      checkDate(guide.updated)
    })
  })
})

describe('every glossary term', () => {
  it('has a unique ASCII slug, and the glossary is sorted by it', () => {
    const slugs = GLOSSARY.map((term) => term.slug)
    for (const slug of slugs) expect(slug).toMatch(KEBAB_ID)
    expect(slugs).toEqual([...new Set(slugs)].sort())
  })

  describe.each(GLOSSARY.map((term) => [term.slug, term] as const))('%s', (_slug, term) => {
    it('links to tools, rules, guides and terms that exist', () => {
      for (const tool of term.tools) expect(TOOL_SLUGS.has(tool), tool).toBe(true)
      for (const rule of term.rules) expect(ruleById(rule), rule).toBeDefined()
      for (const guide of term.guides) expect(GUIDE_SLUGS.has(guide), guide).toBe(true)
      for (const other of term.related) {
        expect(other).not.toBe(term.slug)
        expect(TERM_SLUGS.has(other), other).toBe(true)
      }
    })

    it('has its copy in both languages, with enough to say', () => {
      checkCopy(term.copy)
      checkDate(term.updated)
      // A thin page is worse than none (BUILD-PLAN §6.5).
      const words = Object.values(term.copy.en.sections).join(' ').split(/\s+/).length
      expect(words).toBeGreaterThanOrEqual(120)
    })
  })
})

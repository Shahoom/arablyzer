import { KEBAB_ID } from '@arablyzer/report-schema'
import { ruleById } from '@arablyzer/rules'
import { describe, expect, it } from 'vitest'
import { TOOL_CATEGORIES, TOOLS } from '../src/index'

const ARABIC_LETTER = /(?=\p{L})\p{Script=Arabic}/u

describe('every tool', () => {
  it('has a unique ASCII slug, and TOOLS is sorted by it', () => {
    const slugs = TOOLS.map((tool) => tool.slug)
    for (const slug of slugs) expect(slug).toMatch(KEBAB_ID)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(slugs).toEqual([...slugs].sort())
  })

  describe.each(TOOLS.map((tool) => [tool.slug, tool] as const))('%s', (slug, tool) => {
    it('has a category from the §5.1 table', () => {
      expect(TOOL_CATEGORIES).toContain(tool.category)
    })

    it('runs rules that exist, each once', () => {
      expect(tool.rules.length).toBeGreaterThan(0)
      for (const id of tool.rules) expect(ruleById(id), id).toBeDefined()
      expect(new Set(tool.rules).size).toBe(tool.rules.length)
    })

    it('links to other tools that exist', () => {
      for (const related of tool.related) {
        expect(related).not.toBe(slug)
        expect(TOOLS.map((other) => other.slug)).toContain(related)
      }
      expect(new Set(tool.related).size).toBe(tool.related.length)
    })

    it('was last updated on a real date, not in the future anywhere', () => {
      expect(tool.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      const date = new Date(`${tool.updated}T00:00:00Z`)
      expect(date.toISOString().slice(0, 10)).toBe(tool.updated)
      // The date starts first at UTC+14, so this holds on the day itself in every time zone
      // (M0.3 review: at 02:00 in Muscat the UTC comparison failed).
      expect(Date.parse(`${tool.updated}T00:00:00+14:00`)).toBeLessThanOrEqual(Date.now())
    })

    it('has Arabic copy in Arabic, with the owner review flag set', () => {
      const { ar } = tool.copy
      expect(ar.title).toMatch(ARABIC_LETTER)
      expect(ar.description).toMatch(ARABIC_LETTER)
      expect(ar.summary).toMatch(ARABIC_LETTER)
      expect(typeof ar.reviewed).toBe('boolean')
    })

    it('asks the same questions in both languages', () => {
      expect(tool.copy.en.faq).toHaveLength(tool.copy.ar.faq.length)
      expect(tool.copy.en.checks).toHaveLength(tool.copy.ar.checks.length)
    })
  })
})

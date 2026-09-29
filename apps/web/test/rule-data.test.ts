import { RULES, ruleById } from '@arablyzer/rules'
import { SEVERITY_WEIGHTS } from '@arablyzer/scoring'
import { TOOLS } from '@arablyzer/tools'
import { describe, expect, it } from 'vitest'
import { firstPoint, libraryData, ruleReads } from '../scripts/rule-data'

describe('the rules as their library pages have them', () => {
  const data = libraryData()

  it('has every rule, in both languages, with what its page needs', () => {
    expect(data.rules.map((rule) => rule.id)).toEqual(RULES.map((rule) => rule.id))
    for (const rule of data.rules) {
      for (const lang of ['ar', 'en'] as const) {
        const copy = rule.copy[lang]
        expect(copy.title, rule.id).not.toBe('')
        expect(copy.description.length, rule.id).toBeGreaterThan(0)
        expect(copy.description.length, rule.id).toBeLessThanOrEqual(160)
        // Our own copy, rendered by packages/seo's strict Markdown: no markup of its own.
        for (const html of [copy.why, copy.fix, copy.detect, copy.references]) {
          expect(html, rule.id).not.toBe('')
          expect(html, rule.id).not.toMatch(/<script|<iframe|<[^>]*\son\w+=/i)
        }
      }
    }
  })

  it('weighs each rule as the score does, and a rule for review not at all', () => {
    for (const rule of data.rules) {
      const source = ruleById(rule.id)
      expect(rule.weight, rule.id).toBe(
        source?.manualCheck === true ? 0 : SEVERITY_WEIGHTS[rule.severity],
      )
    }
    const { critical, serious, moderate, minor } = SEVERITY_WEIGHTS
    expect(data.weights).toEqual({ critical, serious, moderate, minor })
  })

  it('lists the tools that run each rule, and rules of its own category beside it', () => {
    for (const rule of data.rules) {
      expect(rule.tools, rule.id).toEqual(
        TOOLS.filter((tool) => tool.rules.includes(rule.id)).map((tool) => tool.slug),
      )
      expect(rule.near.length, rule.id).toBeLessThanOrEqual(3)
      for (const near of rule.near) {
        expect(near, rule.id).not.toBe(rule.id)
        expect(ruleById(near)?.category, rule.id).toBe(rule.category)
      }
    }
  })

  it('shows the example as highlighted code, or none for the rules whose fixtures hold none', () => {
    const shown = data.rules.filter((rule) => rule.example !== null)
    expect(shown.length).toBeGreaterThan(0)
    for (const rule of shown) {
      expect(rule.example?.wrong, rule.id).toContain('<span class="')
      expect(rule.example?.right, rule.id).not.toMatch(/<script|<iframe/i)
    }
    expect(data.rules.find((rule) => rule.id === 'cwv-lcp-poor')?.example).toBeNull()
  })
})

describe('ruleReads', () => {
  const reads = (id: string) => {
    const rule = ruleById(id)
    if (rule === undefined) throw new Error(id)
    return ruleReads(rule)
  }

  it('names the most telling of what a rule reads', () => {
    expect(reads('rtl-horizontal-overflow')).toBe('render')
    expect(reads('cwv-lcp-poor')).toBe('crux')
    expect(reads('robots-blocks-googlebot')).toBe('robots')
    expect(reads('title-missing')).toBe('html')
    // The server's response: its headers, even with a <meta> that counts too, its redirects and
    // its connection; not the page rules that read a header beside the HTML.
    expect(reads('csp-missing')).toBe('http')
    expect(reads('redirect-chain')).toBe('http')
    expect(reads('tls-expiring')).toBe('http')
    expect(reads('canonical-conflict')).toBe('html')
    expect(reads('mixed-content')).toBe('html')
    expect(reads('page-noindex')).toBe('html')
  })
})

describe('firstPoint', () => {
  it('takes the first point as plain text: no bold, code or link markup', () => {
    expect(
      firstPoint('- **Search** treats `١٥` and [15](https://example.com) apart.\n- The second.'),
    ).toBe('Search treats ١٥ and 15 apart.')
    expect(firstPoint('One paragraph\nthat runs on.\n\nAnother.')).toBe(
      'One paragraph that runs on.',
    )
  })

  it('cuts a long point at a word, within a meta description', () => {
    const long = `- ${'كلمة '.repeat(60)}`
    const cut = firstPoint(long)
    expect(cut.length).toBeLessThanOrEqual(160)
    expect(cut.endsWith('…')).toBe(true)
    expect(cut).not.toMatch(/\s…$/)
  })
})

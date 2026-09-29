import { TOOLS } from '@arablyzer/tools'
import { describe, expect, it } from 'vitest'
import { toolsData, toolTag, toolTitles } from '../scripts/tool-data'

describe('the tools as their pages have them', () => {
  const data = toolsData()

  it('has every tool, in both languages, with what its page needs', () => {
    expect(data.tools.map((tool) => tool.slug)).toEqual(TOOLS.map((tool) => tool.slug))
    for (const tool of data.tools) {
      for (const lang of ['ar', 'en'] as const) {
        const copy = tool.copy[lang]
        expect(copy.title, tool.slug).not.toBe('')
        expect(copy.summary, tool.slug).not.toBe('')
        expect(copy.checks.length, tool.slug).toBeGreaterThan(0)
        expect(copy.faq.length, tool.slug).toBeGreaterThan(0)
        // Our own copy, rendered by packages/seo's strict Markdown: no markup of its own.
        for (const html of [copy.fix, copy.methodology, ...copy.checks]) {
          expect(html, tool.slug).not.toMatch(/<script|<iframe|<[^>]*\son\w+=/i)
        }
      }
      expect(tool.rules.length, tool.slug).toBeGreaterThan(0)
    }
  })

  it('says what each tool reads', () => {
    const tag = (slug: string) => {
      const tool = TOOLS.find((candidate) => candidate.slug === slug)
      if (tool === undefined) throw new Error(slug)
      return toolTag(tool)
    }
    expect(tag('ai-crawler-check')).toBe('robots')
    expect(tag('rtl-check')).toBe('html')
    expect(tag('whatsapp-link-check')).toBe('html')
    expect(tag('security-headers')).toBe('http')
    expect(tag('redirect-chain-check')).toBe('http')
    expect(tag('tls-check')).toBe('http')
    expect(tag('canonical-check')).toBe('html')
    expect(tag('mixed-content')).toBe('html')
    expect(tag('hreflang-check')).toBe('html')
  })

  it('names each tool in both languages, for the report page of its result', () => {
    const titles = toolTitles(data)
    expect(Object.keys(titles)).toEqual(TOOLS.map((tool) => tool.slug))
    expect(titles['rtl-check']).toEqual({ ar: 'فحص RTL واتجاه الصفحة', en: 'RTL checker' })
  })
})

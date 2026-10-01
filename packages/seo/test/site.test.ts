import { Report } from '@arablyzer/report-schema'
import { TOOLS, type Tool } from '@arablyzer/tools'
import { describe, expect, it } from 'vitest'
import { auditSite, sampleReport } from '../src/audit/index'
import { PREVIEW_SITE } from '../src/index'

describe('auditSite', () => {
  // Every page of the site: more than five seconds on a busy CI runner.
  it('finds no problem on any of our pages', () => {
    const { pages, problems } = auditSite()
    expect(problems).toEqual([])
    expect(pages.map((page) => page.file)).toEqual([
      ...TOOLS.flatMap((tool) => [`tools/${tool.slug}.html`, `en/tools/${tool.slug}.html`]),
      'report.ar.html',
      'report.en.html',
    ])
  }, 60_000)

  it('reports a defect in a tool page, naming the page', () => {
    const [first, ...rest] = TOOLS
    if (first === undefined) throw new Error('no tools')
    const broken: Tool = {
      ...first,
      copy: {
        ...first.copy,
        ar: { ...first.copy.ar, description: `${first.copy.ar.description} أهلاً, وسهلاً` },
      },
    }
    const { problems } = auditSite(PREVIEW_SITE, [broken, ...rest])
    expect(problems).toContainEqual({
      page: `https://arablyzer.example/tools/${first.slug}`,
      check: 'own-rules',
      message: expect.stringContaining('ar-latin-punctuation fail') as string,
    })
  })
})

describe('sampleReport', () => {
  it('is a real evaluation of a tool example, valid against the schema', () => {
    const report = sampleReport()
    expect(Report.parse(report)).toEqual(report)
    expect(report.findings.length).toBeGreaterThan(0)
    expect(report.target.url).toBe('https://example.com/')
  })
})

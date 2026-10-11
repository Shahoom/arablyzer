import { describe, expect, it } from 'vitest'
import { codeSpan, escapeMarkdown, renderSummary, type PageOutcome } from '../src/summary'
import { golden, ORIGIN } from './fixtures'

const options = { origin: ORIGIN, lang: 'en' as const, maxIssues: 3, failOn: 'none' as const }
const reportOutcome = (prefix: string, gateCount = 0): PageOutcome => ({
  kind: 'report',
  result: {
    url: 'https://shop.example/',
    reportUrl: `${ORIGIN}/r/abc`,
    report: golden(prefix),
    gateCount,
  },
})

describe('the job summary', () => {
  it('shows the score, the counts, the worst problems and the report link', () => {
    const markdown = renderSummary([reportOutcome('10-')], options)
    expect(markdown).toContain('## Arablyzer report: `https://shop.example/`')
    expect(markdown).toContain('Score: **72 of 100**')
    expect(markdown).toContain('| Critical | Serious | Moderate | Minor | Info |')
    expect(markdown).toContain('(https://arablyzer.example/en/rules/')
    expect(markdown).toContain('[Open the full report](https://arablyzer.example/r/abc)')
    // maxIssues is 3: the rest are counted, not listed.
    const rows = markdown.split('\n').filter((line) => line.includes('/rules/'))
    expect(rows).toHaveLength(3)
    expect(markdown).toMatch(/\d+ more rules are in the full report\./)
    expect(markdown).not.toContain('<div')
  })

  it('is right to left in Arabic, with Arabic words and links to the Arabic rule pages', () => {
    const markdown = renderSummary([reportOutcome('10-')], { ...options, lang: 'ar' })
    expect(markdown.startsWith('<div dir="rtl">')).toBe(true)
    expect(markdown).toContain('الدرجة: **72 من 100**')
    expect(markdown).toContain('افتح التقرير الكامل')
    expect(markdown).toContain('(https://arablyzer.example/rules/')
    expect(markdown).not.toContain('/en/rules/')
  })

  it('says whether the check passed, with the gate', () => {
    const failed = renderSummary([reportOutcome('10-', 2)], { ...options, failOn: 'serious' })
    expect(failed).toContain('**The check fails: 2 findings at serious severity or worse.**')
    const passed = renderSummary([reportOutcome('01-')], { ...options, failOn: 'critical' })
    expect(passed).toContain('**The check passes: no findings at critical severity or worse.**')
    expect(passed).toContain('No problems found')
    expect(renderSummary([reportOutcome('10-')], options)).not.toContain('The check')
  })

  it('tells about a scan that was only started, and about a page that could not be scanned', () => {
    const markdown = renderSummary(
      [
        { kind: 'started', url: 'https://a.example/', reportUrl: `${ORIGIN}/r/a` },
        {
          kind: 'problem',
          problem: { url: 'https://b.example/', problem: 'A limit.', retryAfterSeconds: 30 },
        },
      ],
      options,
    )
    expect(markdown).toContain('was started and not waited for')
    expect(markdown).toContain('## The scan did not run: `https://b.example/`')
    expect(markdown).toContain('> A limit. Try again in 30 seconds.')
  })

  it('lets a scanned page put no markdown or HTML of its own into the summary', () => {
    const report = structuredClone(golden('10-'))
    const hostile =
      '![x](https://evil.example/p.png) [click](https://evil.example) <img src=x onerror=1> | a'
    for (const finding of report.findings) {
      finding.message.en = hostile
      finding.evidence.selector = '`</code><script>alert(1)</script>'
    }
    const markdown = renderSummary(
      [
        {
          kind: 'report',
          result: {
            url: 'https://shop.example/',
            reportUrl: `${ORIGIN}/r/abc`,
            report,
            gateCount: 0,
          },
        },
      ],
      options,
    )
    expect(markdown).not.toContain('![x]')
    expect(markdown).not.toContain('[click](')
    // A `<` from the page is escaped (`\\<`), or inside a code span, where HTML is only text.
    const outsideCode = markdown.replace(/`[^`]*`/g, '')
    expect(outsideCode).not.toMatch(/(^|[^\\])<img/)
    expect(outsideCode).not.toContain('<script')
    expect(markdown).toContain('\\!\\[x\\]\\(https://evil.example/p.png\\)')
  })

  it('escapes and shortens text', () => {
    expect(escapeMarkdown('a_b *c* [d](e)\nf')).toBe('a\\_b \\*c\\* \\[d\\]\\(e\\) f')
    expect(escapeMarkdown('x'.repeat(500)).length).toBeLessThanOrEqual(121)
    expect(codeSpan('a`b|c')).toBe("`a'b\\|c`")
  })
})

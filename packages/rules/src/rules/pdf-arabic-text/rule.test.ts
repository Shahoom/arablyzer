import type { PdfFacts } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, fixtureEvidence } from '../../../test/helpers'
import type { Evidence } from '../../rule'
import { rule } from './rule'

const pdfs: PdfFacts = {
  outcome: 'checked',
  linked: 4,
  files: [
    {
      url: 'https://alwaha.com.sa/files/a.pdf',
      outcome: 'read',
      bytes: 1000,
      pages: 3,
      pagesRead: 3,
      title: 'التقرير',
      language: 'ar',
      issues: [
        { kind: 'reversed', measure: 0.9, example: 'العربية' },
        { kind: 'no-title', measure: 0, example: '' },
      ],
    },
    {
      url: 'https://alwaha.com.sa/files/b.pdf',
      outcome: 'read',
      bytes: 1000,
      pages: 2,
      pagesRead: 2,
      title: null,
      language: null,
      issues: [{ kind: 'image-only', measure: 1, example: '' }],
    },
    {
      url: 'https://alwaha.com.sa/files/c.pdf',
      outcome: 'too-large',
      bytes: 0,
      pages: 0,
      pagesRead: 0,
      title: null,
      language: null,
      issues: [],
    },
  ],
}
const withPdfs = async (facts: PdfFacts): Promise<Evidence> => ({
  ...(await fixtureEvidence(rule.id, 'wrong')),
  outside: { pdfs: facts },
})

describe('pdf-arabic-text', () => {
  it('names each PDF and each problem with the Arabic, and leaves the metadata to its rule', async () => {
    const evidence = await withPdfs(pdfs)
    expect(applies(rule, evidence)).toBe(true)
    const findings = detectAll(rule, evidence)
    expect(findings.map((finding) => [finding.message, finding.url])).toEqual([
      ['reversed', 'https://alwaha.com.sa/files/a.pdf'],
      ['image-only', 'https://alwaha.com.sa/files/b.pdf'],
    ])
    expect(findings[0]?.values).toMatchObject({ percent: 90, example: 'العربية', pages: 3 })
  })

  it('passes PDFs that are sound, and does not apply when none was read', async () => {
    const [first] = pdfs.files
    const sound = await withPdfs({
      ...pdfs,
      files: first === undefined ? [] : [{ ...first, issues: [] }],
    })
    expect(detectAll(rule, sound)).toEqual([])
    const none = await withPdfs({ ...pdfs, files: pdfs.files.slice(2) })
    expect(applies(rule, none)).toBe(false)
    expect(applies(rule, await fixtureEvidence(rule.id, 'right'))).toBe(false)
  })
})

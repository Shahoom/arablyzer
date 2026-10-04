import type { PdfFacts } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, fixtureEvidence } from '../../../test/helpers'
import { rule } from './rule'

const facts = (issues: PdfFacts['files'][number]['issues']): PdfFacts => ({
  outcome: 'checked',
  linked: 1,
  files: [
    {
      url: 'https://alwaha.com.sa/a.pdf',
      outcome: 'read',
      bytes: 10,
      pages: 1,
      pagesRead: 1,
      title: null,
      language: null,
      issues,
    },
  ],
})

describe('pdf-metadata', () => {
  it('reports a missing title and a missing language, once for each PDF', async () => {
    const evidence = {
      ...(await fixtureEvidence(rule.id, 'wrong')),
      outside: {
        pdfs: facts([
          { kind: 'no-title', measure: 0, example: '' },
          { kind: 'no-language', measure: 0, example: '' },
          { kind: 'reversed', measure: 1, example: 'x' },
        ]),
      },
    }
    expect(applies(rule, evidence)).toBe(true)
    expect(detectAll(rule, evidence).map((finding) => finding.message)).toEqual([
      'no-title',
      'no-language',
    ])
  })

  it('passes a PDF with both, and does not apply to a page whose PDFs were not read', async () => {
    const evidence = { ...(await fixtureEvidence(rule.id, 'right')), outside: { pdfs: facts([]) } }
    expect(detectAll(rule, evidence)).toEqual([])
    expect(applies(rule, await fixtureEvidence(rule.id, 'right'))).toBe(false)
  })
})

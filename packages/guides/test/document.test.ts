import { describe, expect, it } from 'vitest'
import { parseDocument, type DocumentSchema } from '../src/document'

type Key = 'what' | 'why' | 'faq' | 'refs'
const SCHEMA: DocumentSchema<Key> = {
  headings: {
    ar: { what: 'التعريف', why: 'لماذا يهم', faq: 'أسئلة شائعة', refs: 'المراجع' },
    en: { what: 'Definition', why: 'Why it matters', faq: 'FAQ', refs: 'References' },
  },
  order: ['what', 'why', 'faq', 'refs'],
  required: ['what', 'refs'],
  faq: 'faq',
}

const DOC = `---
reviewed: false
---

# مصطلح

سطر يصفه.

## التعريف

- نص **مهم**.

\`\`\`html
# not a heading inside a fence
\`\`\`

## أسئلة شائعة

### سؤال؟

جواب.

## المراجع

- [مرجع](https://example.com/)
`

describe('parseDocument', () => {
  it('reads the title, the description, the sections, the questions and the review flag', () => {
    const doc = parseDocument(DOC, 'ar', 'doc.md', SCHEMA)
    expect(doc.title).toBe('مصطلح')
    expect(doc.description).toBe('سطر يصفه.')
    expect(doc.sections.what).toContain('# not a heading inside a fence')
    expect(doc.sections.why).toBeUndefined()
    expect(doc.faq).toEqual([{ question: 'سؤال؟', answer: 'جواب.' }])
    expect(doc.reviewed).toBe(false)
  })

  it('refuses what the page cannot show', () => {
    const cases: [string, RegExp][] = [
      [
        DOC.replace('## المراجع\n\n- [مرجع](https://example.com/)\n', ''),
        /missing section "## المراجع"/,
      ],
      [DOC.replace('## التعريف', '## غير ذلك'), /unknown section/],
      [DOC.replace('سطر يصفه.', 'سطر `فيه` كود.'), /plain text/],
      [DOC.replace('سطر يصفه.', ''), /missing the description/],
      [DOC.replace('### سؤال؟\n\nجواب.', '### سؤال؟\n'), /answer to "سؤال؟" is empty/],
      [
        DOC.replace('## التعريف\n\n- نص **مهم**.', '## التعريف\n\n### بلا مكان\n'),
        /outside the questions/,
      ],
      [DOC.replace('reviewed: false', 'reviewed: maybe'), /true or false/],
    ]
    for (const [markdown, message] of cases) {
      expect(() => parseDocument(markdown, 'ar', 'doc.md', SCHEMA)).toThrow(message)
    }
  })

  it('wants the sections in their order', () => {
    const swapped = DOC.replace(/## التعريف[\s\S]*?(?=## أسئلة شائعة)/, '').replace(
      '## المراجع',
      '## التعريف\n\n- نص.\n\n## المراجع',
    )
    expect(() => parseDocument(swapped, 'ar', 'doc.md', SCHEMA)).toThrow(/out of order/)
  })
})

import { describe, expect, it } from 'vitest'
import { methodologyData } from '../scripts/methodology'

const DOC = `# منهجية

كيف نفحص.

## ماذا يفعل الفحص

1. **يجلب الصفحة**.

## الدرجة

الصيغة.

### مثال

| أ | ب |
|---|---|
| \`1\` | \`2\` |

---

# Methodology

How we scan.

## What a scan does

1. **Fetches the page**.

## The score

The formula.

### An example

| a | b |
|---|---|
| \`1\` | \`2\` |
`

describe('methodologyData', () => {
  it('reads each language, its sections and their parts, with ids shared from the English', () => {
    const { ar, en } = methodologyData(DOC)
    expect(ar.title).toBe('منهجية')
    expect(ar.description).toBe('كيف نفحص.')
    expect(ar.sections.map((section) => section.id)).toEqual(['what-a-scan-does', 'the-score'])
    expect(en.sections.map((section) => section.id)).toEqual(['what-a-scan-does', 'the-score'])
    expect(ar.sections[1]?.parts.map((part) => part.title)).toEqual(['مثال'])
    expect(en.sections[0]?.html).toContain('<strong>Fetches the page</strong>')
    expect(en.sections[1]?.parts[0]?.html).toContain('<table>')
  })

  it('reads the repository’s own document', () => {
    const { ar, en } = methodologyData()
    expect(ar.sections.length).toBeGreaterThan(0)
    expect(ar.sections.map((section) => section.id)).toEqual(
      en.sections.map((section) => section.id),
    )
  })

  it('refuses a document whose languages do not match', () => {
    expect(() => methodologyData(DOC.replace('## The score', 'Just text.'))).toThrow(
      /different sections/,
    )
    expect(() => methodologyData(DOC.replace('\n---\n', '\n'))).toThrow(/a line of ---/)
  })
})

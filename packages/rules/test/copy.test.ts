import { describe, expect, it } from 'vitest'
import { parseRuleCopy, placeholders, renderMessage } from '../src/copy'

const AR = `---
reviewed: false # the owner sets true
---

# لغة الصفحة لا تطابق محتواها

## الرسائل

### missing

المحتوى عربي، لكن وسم \`<html>\` بلا سمة \`lang\`.

### not-arabic-script

الصفحة تعلن \`lang="{declaredLang}"\`
على محتوى عربي.

## لماذا يهم

قارئ الشاشة يختار النطق من \`lang\`.

## كيف تصلح

\`\`\`html
# not a heading inside a fence
<html lang="ar" dir="rtl">
\`\`\`

## كيف نكشف

نعدّ الحروف.

## المراجع

- [WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/language-of-page)
`

describe('parseRuleCopy', () => {
  it('reads the title, messages as plain text, sections and the review flag', () => {
    const copy = parseRuleCopy(AR, 'ar', 'ar.md')
    expect(copy.title).toBe('لغة الصفحة لا تطابق محتواها')
    expect(copy.messages).toEqual({
      missing: 'المحتوى عربي، لكن وسم <html> بلا سمة lang.',
      'not-arabic-script': 'الصفحة تعلن lang="{declaredLang}" على محتوى عربي.',
    })
    expect(copy.reviewed).toBe(false)
    expect(copy.sections.fix).toContain('# not a heading inside a fence')
    expect(copy.sections.references).toContain('https://www.w3.org/')
  })

  it('matches Arabic headings with or without harakat', () => {
    expect(() => parseRuleCopy(AR.replace('كيف تصلح', 'كيف تُصلح'), 'ar', 'ar.md')).not.toThrow()
  })

  it('has no review flag without front matter', () => {
    const en = `# Title\n\n## Messages\n\n### missing\n\nNo lang.\n\n## Why it matters\n\nx\n\n## How to fix\n\nx\n\n## How we detect\n\nx\n\n## References\n\n- x\n`
    expect(parseRuleCopy(en, 'en', 'en.md').reviewed).toBeNull()
  })

  it.each([
    [
      'a missing section',
      AR.replace('## كيف نكشف\n\nنعدّ الحروف.\n', ''),
      /missing section "## كيف نكشف"/,
    ],
    ['an unknown section', AR.replace('## المراجع', '## مصادر'), /unknown section "## مصادر"/],
    ['an empty section', AR.replace('نعدّ الحروف.', ''), /"## كيف نكشف" is empty/],
    [
      'an unknown front matter key',
      AR.replace('reviewed: false', 'Reviewed: yes'),
      /unknown front matter/,
    ],
    ['a non-boolean review flag', AR.replace('reviewed: false', 'reviewed: yes'), /true or false/],
    [
      'a message id that is not kebab-case',
      AR.replace('### missing', '### Missing_Lang'),
      /kebab-case/,
    ],
    [
      'a duplicated message id',
      AR.replace('### not-arabic-script', '### missing'),
      /appears twice/,
    ],
    [
      'text before the first message id',
      AR.replace('## الرسائل\n', '## الرسائل\n\nمقدمة\n'),
      /before the first/,
    ],
    [
      'a second title',
      AR.replace('## المراجع', '# عنوان آخر\n\n## المراجع'),
      /more than one # title/,
    ],
  ])('rejects %s and names the file', (_name, markdown, error) => {
    expect(() => parseRuleCopy(markdown, 'ar', 'rules/x/copy.ar.md')).toThrow(error)
    expect(() => parseRuleCopy(markdown, 'ar', 'rules/x/copy.ar.md')).toThrow(
      /rules\/x\/copy\.ar\.md/,
    )
  })
})

describe('messages', () => {
  it('lists placeholders and fills them from values', () => {
    expect(placeholders('lang="{declaredLang}" in {count} places')).toEqual([
      'declaredLang',
      'count',
    ])
    expect(renderMessage('lang="{declaredLang}" ({count})', { declaredLang: 'en', count: 2 })).toBe(
      'lang="en" (2)',
    )
  })

  it('throws when a value is missing: that is a bug in the rule', () => {
    expect(() => renderMessage('lang="{declaredLang}"', {})).toThrow(/declaredLang/)
  })
})

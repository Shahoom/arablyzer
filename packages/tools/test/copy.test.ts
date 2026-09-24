import { describe, expect, it } from 'vitest'
import { parseToolCopy } from '../src/copy'

const AR = `---
reviewed: false
---

# فحص RTL

يتحقق من اتجاه
الصفحة ولغتها.

## ماذا تفحص

- أن \`dir="rtl"\` في وسم \`<html>\`.
- أن \`lang\` لغة عربية.

## مثال

### خطأ

\`\`\`html
<html lang="en">
\`\`\`

### صحيح

\`\`\`html
<html lang="ar" dir="rtl">
\`\`\`

## كيف تصلح

ضع السمتين في وسم \`<html>\`.

## أسئلة شائعة

### هل يكفي CSS؟

لا، الاتجاه جزء من النص.

### لماذا \`<html>\`؟

لأن كل العناصر ترثه.

## المنهجية

نقرأ HTML الخام.
`

const EN = `# RTL checker

Checks the direction.

## What it checks

- \`dir="rtl"\` on \`<html>\`.

## Example

### Wrong

\`\`\`robots.txt
User-agent: *
Disallow: /
\`\`\`

### Right

\`\`\`robots.txt
User-agent: *
Allow: /
\`\`\`

## How to fix

Add it.

## FAQ

### Why?

Because.

## Methodology

We read the raw HTML.
`

const parse = (markdown: string, lang: 'ar' | 'en' = 'ar') =>
  parseToolCopy(markdown, lang, 'tools/test/copy.md')

describe('parseToolCopy', () => {
  it('reads every part of the page, whatever the harakat in the headings', () => {
    expect(parse(AR)).toEqual({
      title: 'فحص RTL',
      description: 'يتحقق من اتجاه الصفحة ولغتها.',
      checks: ['أن `dir="rtl"` في وسم `<html>`.', 'أن `lang` لغة عربية.'],
      example: {
        wrong: { lang: 'html', code: '<html lang="en">' },
        right: { lang: 'html', code: '<html lang="ar" dir="rtl">' },
      },
      fix: 'ضع السمتين في وسم `<html>`.',
      faq: [
        { question: 'هل يكفي CSS؟', answer: 'لا، الاتجاه جزء من النص.' },
        { question: 'لماذا `<html>`؟', answer: 'لأن كل العناصر ترثه.' },
      ],
      methodology: 'نقرأ HTML الخام.',
      reviewed: false,
    })
  })

  it('reads English headings and robots.txt examples, and leaves reviewed unset without front matter', () => {
    const copy = parse(EN, 'en')
    expect(copy.example.wrong).toEqual({ lang: 'robots.txt', code: 'User-agent: *\nDisallow: /' })
    expect(copy.reviewed).toBeNull()
  })

  it('keeps the description plain, for the meta description', () => {
    expect(parse(AR.replace('يتحقق من اتجاه', 'يتحقق من `dir`')).description).toBe(
      'يتحقق من dir الصفحة ولغتها.',
    )
  })

  it.each([
    ['a missing title', AR.replace('# فحص RTL\n', ''), /missing # title/],
    [
      'a second title',
      AR.replace('## المنهجية', '# عنوان آخر\n\n## المنهجية'),
      /more than one # title/,
    ],
    [
      'no description',
      AR.replace('يتحقق من اتجاه\nالصفحة ولغتها.\n', ''),
      /missing the description/,
    ],
    [
      'a description in two paragraphs',
      AR.replace('يتحقق من اتجاه\n', 'يتحقق من اتجاه\n\n'),
      /description must be one paragraph/,
    ],
    ['an unknown section', AR.replace('## المنهجية', '## أخرى'), /unknown section "## أخرى"/],
    ['a missing section', AR.replace(/## المنهجية[\s\S]*$/, ''), /missing section "## المنهجية"/],
    [
      'an empty section',
      AR.replace('ضع السمتين في وسم `<html>`.', ''),
      /section "## كيف تُصلح" is empty/,
    ],
    [
      'a check that is not a bullet',
      AR.replace('- أن `lang`', 'أن `lang`'),
      /"## ماذا تفحص" takes "- " items only/,
    ],
    ['a missing wrong example', AR.replace('### خطأ', '### صحيح'), /"### صحيح" appears twice/],
    [
      'an example without code',
      AR.replace(/```html\n<html lang="en">\n```/, 'نص'),
      /"### خطأ" needs one code block/,
    ],
    [
      'an example in another language',
      AR.replace('```html\n<html lang="en">', '```css\n<html lang="en">'),
      /code block must be html or robots.txt/,
    ],
    [
      'text beside the example code',
      AR.replace('### خطأ\n', '### خطأ\n\nشرح.\n'),
      /"### خطأ" takes only its code block/,
    ],
    [
      'a question with no answer',
      AR.replace('لأن كل العناصر ترثه.', ''),
      /answer to "لماذا `<html>`؟" is empty/,
    ],
    [
      'no questions',
      AR.replace(/### هل يكفي[\s\S]*ترثه\.\n/, 'نص.\n'),
      /"## أسئلة شائعة" needs at least one "### question"/,
    ],
    [
      'a subheading elsewhere',
      AR.replace('نقرأ HTML الخام.', '### فرع\n\nنقرأ HTML الخام.'),
      /"### فرع" is outside/,
    ],
    [
      'an unknown front matter key',
      AR.replace('reviewed: false', 'draft: true'),
      /unknown front matter line/,
    ],
    ['an unclosed code block', `${AR}\n\`\`\`html\n<p>`, /code block is not closed/],
  ])('rejects %s', (_name, markdown, error) => {
    expect(() => parse(markdown)).toThrow(error)
  })
})

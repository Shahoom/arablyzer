import { describe, expect, it } from 'vitest'
import { parseToolCopy } from '../src/copy'

const AR = `---
reviewed: false
summary: هل تُقرأ صفحتك من اليمين؟
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

const EN = `---
summary: Does your page read right to left?
---

# RTL checker

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
      summary: 'هل تُقرأ صفحتك من اليمين؟',
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

  it('reads an HTTP example as written', () => {
    const exchange =
      'HTTP/1.1 301 Moved Permanently\nLocation: https://www.example.com/\n\nHTTP/1.1 200 OK'
    const copy = parse(AR.replace('```html\n<html lang="en">', `\`\`\`http\n${exchange}`))
    expect(copy.example.wrong).toEqual({ lang: 'http', code: exchange })
  })

  it('reads a DNS example as written', () => {
    const records =
      'example.com.  TXT  "v=spf1 -all"\n_dmarc.example.com.  TXT  "v=DMARC1; p=reject"'
    const copy = parse(AR.replace('```html\n<html lang="en">', `\`\`\`dns\n${records}`))
    expect(copy.example.wrong).toEqual({ lang: 'dns', code: records })
  })

  it('reads a JSON example as written', () => {
    const answer = '{ "record": { "metrics": {} } }'
    const copy = parse(AR.replace('```html\n<html lang="en">', `\`\`\`json\n${answer}`))
    expect(copy.example.wrong).toEqual({ lang: 'json', code: answer })
  })

  it('reads English headings and robots.txt examples, and leaves reviewed unset without it', () => {
    const copy = parse(EN, 'en')
    expect(copy.example.wrong).toEqual({ lang: 'robots.txt', code: 'User-agent: *\nDisallow: /' })
    expect(copy.reviewed).toBeNull()
    expect(copy.summary).toBe('Does your page read right to left?')
  })

  it("needs the card's line, plain, and reads a # inside it", () => {
    expect(() => parse(AR.replace('summary: هل تُقرأ صفحتك من اليمين؟\n', ''))).toThrow(
      /front matter needs `summary:`/,
    )
    expect(() => parse(AR.replace('summary: هل تُقرأ صفحتك من اليمين؟', 'summary:'))).toThrow(
      /summary is empty/,
    )
    expect(() => parse(AR.replace('من اليمين؟', '**من اليمين**؟'))).toThrow(/plain text/)
    expect(parse(AR.replace('من اليمين؟', 'من اليمين في C#؟ # a comment')).summary).toBe(
      'هل تُقرأ صفحتك من اليمين في C#؟',
    )
  })

  it('keeps the description plain, for the meta description', () => {
    expect(parse(AR.replace('يتحقق من اتجاه', 'يتحقق من `dir`')).description).toBe(
      'يتحقق من dir الصفحة ولغتها.',
    )
    // M0.3 review: bold and links reached the meta description as written.
    expect(() => parse(AR.replace('يتحقق من اتجاه', 'يتحقق **مجاناً** من اتجاه'))).toThrow(
      /description is plain text/,
    )
    expect(() =>
      parse(AR.replace('يتحقق من اتجاه', 'يتحقق من [الاتجاه](https://example.com/)')),
    ).toThrow(/description is plain text/)
  })

  // M0.3 review: the harakat range also took in the Arabic-Indic digits.
  it('ignores harakat in headings, but not digits', () => {
    expect(() => parse(AR.replace('## المنهجية', '## المنهجية٢٠٢٦'))).toThrow(/unknown section/)
  })

  it('reads a heading in one pass, however much space it holds', () => {
    const start = performance.now()
    expect(() => parse(`# a${' '.repeat(40_000)}b\n`)).toThrow(/missing the description/)
    expect(performance.now() - start).toBeLessThan(200)
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
      /code block must be html, robots.txt, http, dns or json/,
    ],
    [
      'a DNS example its test cannot read',
      AR.replace('```html\n<html lang="en">\n```', '```dns\nexample.com. A 192.0.2.1\n```'),
      /"### خطأ": each line is a TXT record/,
    ],
    [
      'a JSON example that does not parse',
      AR.replace('```html\n<html lang="en">', '```json\n{ "record": '),
      /"### خطأ": the JSON does not parse/,
    ],
    [
      'an HTTP example its test cannot read',
      AR.replace('```html\n<html lang="en">\n```', '```http\nHTTP/1.1 301 Moved Permanently\n```'),
      /"### خطأ": the last response is the page, not a redirect/,
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

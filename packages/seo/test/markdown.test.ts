import { RULES } from '@arablyzer/rules'
import { TOOLS } from '@arablyzer/tools'
import { describe, expect, it } from 'vitest'
import { renderInline, renderMarkdown } from '../src/index'

describe('renderMarkdown', () => {
  it('renders paragraphs, joining their lines', () => {
    expect(renderMarkdown('سطر أول\nسطر ثانٍ\n\nفقرة أخرى.')).toBe(
      '<p>سطر أول سطر ثانٍ</p>\n<p>فقرة أخرى.</p>',
    )
  })

  it('renders bullet and numbered lists, with indented continuation lines', () => {
    expect(renderMarkdown('- أول\n- ثانٍ\n  يكمل\n\n1. واحد\n2. اثنان')).toBe(
      '<ul><li>أول</li><li>ثانٍ يكمل</li></ul>\n<ol><li>واحد</li><li>اثنان</li></ol>',
    )
  })

  it('renders code blocks left to right, escaped and untouched', () => {
    expect(renderMarkdown('```html\n<html lang="ar" dir="rtl">\n  **x** `y`\n```')).toBe(
      '<pre dir="ltr"><code class="language-html">&lt;html lang=&quot;ar&quot; dir=&quot;rtl&quot;&gt;\n  **x** `y`</code></pre>',
    )
    expect(renderMarkdown('```robots.txt\nUser-agent: *\n```')).toContain(
      '<code class="language-robots-txt">',
    )
    expect(renderMarkdown('```\nplain\n```')).toBe('<pre dir="ltr"><code>plain</code></pre>')
    expect(renderMarkdown('````md\n```text\ninner\n```\n````')).toBe(
      '<pre dir="ltr"><code class="language-md">```text\ninner\n```</code></pre>',
    )
  })

  it('renders tables, with inline markup in the cells', () => {
    expect(
      renderMarkdown('| بدل | استخدم |\n|---|:---:|\n| `,` | `،` |\n| a \\| b | **c** |'),
    ).toBe(
      '<table><thead><tr><th>بدل</th><th>استخدم</th></tr></thead><tbody>' +
        '<tr><td><code dir="ltr">,</code></td><td><code dir="ltr">،</code></td></tr>' +
        '<tr><td>a | b</td><td><strong>c</strong></td></tr></tbody></table>',
    )
  })

  it('escapes HTML written as text, so copy cannot inject markup', () => {
    expect(renderMarkdown('<script>alert(1)</script> & <b>x</b>')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;b&gt;x&lt;/b&gt;</p>',
    )
  })

  it.each([
    ['a heading', '## عنوان', /headings are not allowed/],
    ['a quote', '> اقتباس', /quotes are not supported/],
    ['a table without its separator row', '| a | b |\n| c | d |', /table needs a separator row/],
    ['a table row with too many cells', '| a | b |\n|---|---|\n| c | d | e |', /3 cells, not 2/],
    ['an unclosed code block', '```html\n<p>', /code block is not closed/],
    // M0.3 review: each of these used to render wrongly without a word.
    [
      'a table separator with too few cells',
      '| a | b |\n|---|\n| c | d |',
      /separator has 1 cells, not 2/,
    ],
    ['a nested list', '- a\n  - b', /nested lists are not supported/i],
    ['a code block inside a list item', '- a\n  ```\n  x\n  ```', /code blocks inside list items/i],
    ['a numbered list that does not start at 1', '3. c\n4. d', /numbered lists count from 1/i],
    ['a skipped number', '1. a\n3. c', /numbered lists count from 1/i],
    [
      'a paragraph line that looks like a numbered item',
      'نص\n2. المزيد',
      /numbered lists count from 1/i,
    ],
    ['text right after a list item', '- أول\nتكملة', /right after a list item/],
    [
      'a link with parentheses in its URL',
      '[W](https://en.wikipedia.org/wiki/Bidi_(text))',
      /link could not be read/,
    ],
    ['a link with a title', '[x](https://example.com/ "title")', /link could not be read/],
  ])('rejects %s', (_name, markdown, error) => {
    expect(() => renderMarkdown(markdown)).toThrow(error)
  })
})

describe('renderInline', () => {
  it('renders code left to right, bold, and links', () => {
    expect(renderInline('ضع `dir="rtl"` في **وسم `<html>`** ثم [اقرأ](/rules/rtl-html-dir).')).toBe(
      'ضع <code dir="ltr">dir=&quot;rtl&quot;</code> في <strong>وسم <code dir="ltr">&lt;html&gt;</code></strong> ثم <a href="/rules/rtl-html-dir">اقرأ</a>.',
    )
  })

  it('reads backslash escapes as the character itself', () => {
    expect(renderInline('\\*\\*not bold\\*\\* and \\`not code\\`')).toBe(
      '**not bold** and `not code`',
    )
  })

  it('stays linear on unclosed markup (M0.3 review)', () => {
    const start = performance.now()
    expect(() => renderInline('[a]('.repeat(40_000))).toThrow(/link could not be read/)
    expect(renderInline('['.repeat(40_000))).toHaveLength(40_000)
    expect(renderInline(`**${'a'.repeat(40_000)}`)).toHaveLength(40_002)
    expect(performance.now() - start).toBeLessThan(500)
  })

  it('keeps markup inside code literal', () => {
    expect(renderInline('`**x** [a](b)`')).toBe('<code dir="ltr">**x** [a](b)</code>')
  })

  it('links only to https and to our own paths', () => {
    expect(renderInline('[W3C](https://www.w3.org/International/)')).toBe(
      '<a href="https://www.w3.org/International/">W3C</a>',
    )
    for (const href of [
      'javascript:alert(1)',
      'http://example.com/',
      '//evil.example/',
      'data:text/html,x',
      // Browsers read "\\" as "/": these would leave the site (M0.3 review).
      '/\\evil.example/path',
      'https:\\\\evil.example/',
      'https://a.example/\\x',
    ]) {
      expect(() => renderInline(`[x](${href})`), href).toThrow(
        /links must be https:|could not be read/,
      )
    }
  })
})

describe('our copy', () => {
  it('renders every section of every rule and tool', () => {
    for (const rule of RULES) {
      for (const lang of ['ar', 'en'] as const) {
        const { why, fix, detect, references } = rule.copy[lang].sections
        for (const section of [why, fix, detect, references]) {
          expect(() => renderMarkdown(section), `${rule.id} ${lang}`).not.toThrow()
        }
      }
    }
    for (const tool of TOOLS) {
      for (const lang of ['ar', 'en'] as const) {
        const copy = tool.copy[lang]
        for (const text of [copy.fix, copy.methodology, ...copy.faq.map((entry) => entry.answer)]) {
          expect(() => renderMarkdown(text), `${tool.slug} ${lang}`).not.toThrow()
        }
      }
    }
  })
})

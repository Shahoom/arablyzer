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
    ]) {
      expect(() => renderInline(`[x](${href})`), href).toThrow(/links must be https:/)
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

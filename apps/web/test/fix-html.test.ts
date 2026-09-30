import { renderMarkdown } from '@arablyzer/seo'
import { describe, expect, it } from 'vitest'
import { fixHtml, WHOLE } from '../scripts/fix-html'

describe('fixHtml', () => {
  it('scrolls a table on its own, and lets a keyboard reach it and every code block', () => {
    const html = fixHtml(
      renderMarkdown(
        '| بدل | استخدم |\n|---|---|\n| `left` | `inset-inline-start` |\n\n```css\na { left: 0 }\n```',
      ),
    )
    expect(html).toContain('<div class="fix-table" tabindex="0"><table>')
    expect(html).toContain('</table></div>')
    expect(html).toContain('<pre dir="ltr" tabindex="0"><code class="language-css">')
  })

  it('keeps short inline code whole, and lets long code and code blocks wrap', () => {
    const long = `x${'-a'.repeat(WHOLE)}`
    const html = fixHtml(
      renderMarkdown(`Use \`margin-inline-end\` or \`${long}\`.\n\n\`\`\`\nplain block\n\`\`\``),
    )
    expect(html).toContain('<code dir="ltr" class="whole">margin-inline-end</code>')
    expect(html).toContain(`<code dir="ltr">${long}</code>`)
    expect(html).toContain('<pre dir="ltr" tabindex="0"><code>plain block</code></pre>')
  })

  it('counts an escaped character as one', () => {
    const html = fixHtml(renderMarkdown(`\`${'<'.repeat(WHOLE)}\``))
    expect(html).toContain('class="whole"')
  })
})

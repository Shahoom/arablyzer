import { describe, expect, it } from 'vitest'
import { highlight } from '../src/lib/code'

describe('highlight', () => {
  it('mutes the markup, and colours the quoted values as the example is wrong or right', () => {
    expect(highlight('<a href="https://wa.me/968">راسلنا</a>', 'html', 'wrong')).toBe(
      '<span class="text-ink-3">&lt;a href=</span><span class="text-signal">&quot;https://wa.me/968&quot;</span><span class="text-ink-3">&gt;</span>راسلنا<span class="text-ink-3">&lt;/a&gt;</span>',
    )
    expect(highlight('<html lang="ar">', 'html', 'right')).toContain(
      '<span class="text-pass">&quot;ar&quot;</span>',
    )
  })

  it('mutes a comment whole, and escapes everything', () => {
    expect(highlight('<!-- "x" -->\n<p>&</p>', 'html', 'wrong')).toBe(
      '<span class="text-ink-3">&lt;!-- &quot;x&quot; --&gt;</span>\n<span class="text-ink-3">&lt;p&gt;</span>&amp;<span class="text-ink-3">&lt;/p&gt;</span>',
    )
    expect(highlight('<p>"<script>"</p>', 'html', 'right')).not.toContain('<script>')
  })

  it("colours a robots.txt rule's value, and mutes its directive", () => {
    expect(highlight('User-agent: GPTBot\nDisallow: /\n# x', 'robots.txt', 'wrong')).toBe(
      '<span class="text-ink-3">User-agent:</span><span class="text-signal"> GPTBot</span>\n<span class="text-ink-3">Disallow:</span><span class="text-signal"> /</span>\n# x',
    )
  })

  it("colours a CSS declaration's value, and mutes the rest", () => {
    expect(highlight('.menu {\n  left: -280px;\n}', 'css', 'wrong')).toBe(
      '<span class="text-ink-3">.menu {</span>\n  <span class="text-ink-3">left: </span><span class="text-signal">-280px</span><span class="text-ink-3">;</span>\n<span class="text-ink-3">}</span>',
    )
    expect(highlight("  font-family: 'Tajawal', sans-serif;", 'css', 'right')).toBe(
      '  <span class="text-ink-3">font-family: </span><span class="text-pass">&#39;Tajawal&#39;, sans-serif</span><span class="text-ink-3">;</span>',
    )
    expect(highlight('a:focus,\na:hover {', 'css', 'right')).not.toContain('text-pass')
    expect(highlight('a:hover {\n\n  color: "x";\n}', 'css', 'right')).toBe(
      '<span class="text-ink-3">a:hover {</span>\n\n  <span class="text-ink-3">color: </span><span class="text-pass">&quot;x&quot;</span><span class="text-ink-3">;</span>\n<span class="text-ink-3">}</span>',
    )
  })

  it("colours a JSON member's value, and mutes its name", () => {
    expect(highlight('"price": "12.500",\n"offers": {', 'json', 'right')).toBe(
      '<span class="text-ink-3">&quot;price&quot;: </span><span class="text-pass">&quot;12.500&quot;</span><span class="text-ink-3">,</span>\n<span class="text-ink-3">&quot;offers&quot;: {</span>',
    )
  })
})

import { describe, expect, it } from 'vitest'
import { highlight } from '../src/lib/code'

describe('highlight', () => {
  it('mutes the markup, and colours the quoted values as the example is wrong or right', () => {
    expect(highlight('<a href="https://wa.me/968">راسلنا</a>', 'html', 'wrong')).toBe(
      '<span class="text-ink-3">&lt;a href=</span><span class="text-serious">&quot;https://wa.me/968&quot;</span><span class="text-ink-3">&gt;</span>راسلنا<span class="text-ink-3">&lt;/a&gt;</span>',
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
      '<span class="text-ink-3">User-agent:</span><span class="text-serious"> GPTBot</span>\n<span class="text-ink-3">Disallow:</span><span class="text-serious"> /</span>\n# x',
    )
  })

  it("colours a CSS declaration's value, and mutes the rest", () => {
    expect(highlight('.menu {\n  left: -280px;\n}', 'css', 'wrong')).toBe(
      '<span class="text-ink-3">.menu {</span>\n  <span class="text-ink-3">left: </span><span class="text-serious">-280px</span><span class="text-ink-3">;</span>\n<span class="text-ink-3">}</span>',
    )
    expect(highlight("  font-family: 'Tajawal', sans-serif;", 'css', 'right')).toBe(
      '  <span class="text-ink-3">font-family: </span><span class="text-pass">&#39;Tajawal&#39;, sans-serif</span><span class="text-ink-3">;</span>',
    )
    expect(highlight('a:focus,\na:hover {', 'css', 'right')).not.toContain('text-pass')
    expect(highlight('a:hover {\n\n  color: "x";\n}', 'css', 'right')).toBe(
      '<span class="text-ink-3">a:hover {</span>\n\n  <span class="text-ink-3">color: </span><span class="text-pass">&quot;x&quot;</span><span class="text-ink-3">;</span>\n<span class="text-ink-3">}</span>',
    )
  })

  it("mutes an HTTP exchange's status lines and header names, and colours the values", () => {
    expect(
      highlight(
        'HTTP/1.1 301 Moved Permanently\nLocation: https://www.example.com/\n\nHTTP/2 200\nX-Frame-Options: <DENY>',
        'http',
        'right',
      ),
    ).toBe(
      '<span class="text-ink-3">HTTP/1.1 301 Moved Permanently</span>\n<span class="text-ink-3">Location:</span><span class="text-pass"> https://www.example.com/</span>\n\n<span class="text-ink-3">HTTP/2 200</span>\n<span class="text-ink-3">X-Frame-Options:</span><span class="text-pass"> &lt;DENY&gt;</span>',
    )
    expect(highlight('Referrer-Policy:', 'http', 'wrong')).toBe(
      '<span class="text-ink-3">Referrer-Policy:</span>',
    )
  })

  it("mutes a DNS record's name and type, and colours its strings", () => {
    expect(
      highlight(
        'example.com.  TXT  "v=spf1 -all"\n\n_dmarc.example.com.  TXT  "v=DMARC1; p=<reject>"',
        'dns',
        'right',
      ),
    ).toBe(
      '<span class="text-ink-3">example.com.  TXT  </span><span class="text-pass">&quot;v=spf1 -all&quot;</span>\n\n<span class="text-ink-3">_dmarc.example.com.  TXT  </span><span class="text-pass">&quot;v=DMARC1; p=&lt;reject&gt;&quot;</span>',
    )
  })

  it("colours a JSON member's value, and mutes its name", () => {
    expect(highlight('"price": "12.500",\n"offers": {', 'json', 'right')).toBe(
      '<span class="text-ink-3">&quot;price&quot;: </span><span class="text-pass">&quot;12.500&quot;</span><span class="text-ink-3">,</span>\n<span class="text-ink-3">&quot;offers&quot;: {</span>',
    )
  })
})

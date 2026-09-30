const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character)
}

const MUTED = 'text-ink-3'
const TONE = { wrong: 'text-signal', right: 'text-pass' } as const

const span = (className: string, text: string) =>
  `<span class="${className}">${escapeHtml(text)}</span>`

/**
 * An example's code as the design draws it (the Tool-WhatsApp board): its markup muted, the
 * values in quotes, or a robots.txt rule's path, in the colour of the example, the signal for
 * the wrong one and pass for the right one; the text between tags as it is. Escaped throughout.
 */
export function highlight(
  code: string,
  lang: 'html' | 'robots.txt',
  tone: keyof typeof TONE,
): string {
  if (lang === 'robots.txt') {
    return code
      .split('\n')
      .map((line) => {
        const match = /^(\s*[A-Za-z-]+\s*:)(.*)$/.exec(line)
        if (match === null) return escapeHtml(line)
        const [, directive = '', value = ''] = match
        return `${span(MUTED, directive)}${value === '' ? '' : span(TONE[tone], value)}`
      })
      .join('\n')
  }
  let out = ''
  let at = 0
  for (const match of code.matchAll(/<!--[\s\S]*?-->|<[^<>]*>/g)) {
    const index = match.index
    out += escapeHtml(code.slice(at, index))
    const tag = match[0]
    if (tag.startsWith('<!--')) {
      out += span(MUTED, tag)
    } else {
      let last = 0
      for (const value of tag.matchAll(/"[^"]*"|'[^']*'/g)) {
        out += span(MUTED, tag.slice(last, value.index))
        out += span(TONE[tone], value[0])
        last = value.index + value[0].length
      }
      out += span(MUTED, tag.slice(last))
    }
    at = index + tag.length
  }
  return out + escapeHtml(code.slice(at))
}

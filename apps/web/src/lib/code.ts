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
 * values in quotes, a CSS declaration's value, a robots.txt rule's path, an HTTP header's value
 * or a DNS record's strings in the colour of the example, the signal for the wrong one and pass
 * for the right one; the text between tags as it is. Escaped throughout.
 */
export function highlight(
  code: string,
  lang: 'html' | 'css' | 'json' | 'robots.txt' | 'http' | 'dns',
  tone: keyof typeof TONE,
): string {
  if (lang === 'dns') {
    // TXT records: each one's name and type muted, its strings in the example's colour.
    return code
      .split('\n')
      .map((line) => {
        const start = line.indexOf('"')
        if (start === -1) return escapeHtml(line)
        return `${span(MUTED, line.slice(0, start))}${span(TONE[tone], line.slice(start))}`
      })
      .join('\n')
  }
  if (lang === 'http') {
    // An HTTP exchange: each status line muted, each header's name muted and its value in the
    // example's colour, blank lines between the responses as they are.
    return code
      .split('\n')
      .map((line) => {
        if (/^HTTP\/\S+\s/.test(line)) return span(MUTED, line)
        const match = /^([!#$%&'*+\-.^_`|~0-9A-Za-z]+:)(.*)$/.exec(line)
        if (match === null) return escapeHtml(line)
        const [, name = '', value = ''] = match
        return `${span(MUTED, name)}${value === '' ? '' : span(TONE[tone], value)}`
      })
      .join('\n')
  }
  if (lang === 'json') {
    // A member on its own line, its value in the example's colour; an object or an array it
    // opens stays muted, as do braces and brackets.
    return code
      .split('\n')
      .map((line) => {
        if (line.trim() === '') return line
        const indent = /^\s*/.exec(line)?.[0] ?? ''
        const match = /^("(?:[^"\\]|\\.)*"\s*:\s*)(.*?)(,?)$/.exec(line.slice(indent.length))
        if (match === null || /^[{[]/.test(match[2] ?? '')) {
          return `${indent}${span(MUTED, line.slice(indent.length))}`
        }
        const [, name = '', value = '', comma = ''] = match
        return `${indent}${span(MUTED, name)}${span(TONE[tone], value)}${comma === '' ? '' : span(MUTED, comma)}`
      })
      .join('\n')
  }
  if (lang === 'css') {
    // A declaration on its own line, its value in the example's colour; selectors, braces and
    // comments muted, blank lines as they are.
    return code
      .split('\n')
      .map((line) => {
        if (line.trim() === '') return line
        // A selector (`a:hover {`, `a:focus,`) is not one: it opens a block or goes on to the next.
        const match = /,\s*$/.test(line)
          ? null
          : /^(\s*)([-\w]+\s*:\s*)([^;{}]*?)(\s*;?\s*)$/.exec(line)
        if (match === null) {
          const indent = /^\s*/.exec(line)?.[0] ?? ''
          return `${indent}${span(MUTED, line.slice(indent.length))}`
        }
        const [, indent = '', property = '', value = '', end = ''] = match
        return `${indent}${span(MUTED, property)}${span(TONE[tone], value)}${end === '' ? '' : span(MUTED, end)}`
      })
      .join('\n')
  }
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

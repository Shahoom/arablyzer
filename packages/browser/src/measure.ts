/// <reference lib="dom" />
/**
 * The script that measures a rendered page, run inside it with page.evaluate. It must stay
 * self-contained: it is sent to the page as source text, so it can use nothing from this module
 * but its own body. It runs in the page's own JavaScript world, so a page can falsify its own
 * measurements; it can only make its own report wrong, and Node validates and bounds the result.
 */

export interface MeasureLimits {
  /** Elements looked at for overflow, and text nodes walked for Arabic text. */
  readonly maxNodes: number
  readonly maxBlocks: number
  readonly maxOverflow: number
  /** Candidate tokens measured character by character. */
  readonly maxTokens: number
  readonly maxBidi: number
  readonly maxFontFaces: number
  readonly textLength: number
  readonly timeMs: number
}

export interface MeasuredBox {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface Measured {
  readonly dir: string
  readonly lang: string | null
  readonly viewportMeta: string | null
  readonly viewport: { readonly width: number; readonly height: number }
  readonly scrollWidth: number
  readonly overflow: readonly { readonly selector: string; readonly box: MeasuredBox }[]
  readonly arabicText: readonly {
    readonly selector: string
    readonly box: MeasuredBox
    readonly text: string
    readonly letterSpacing: number
    readonly letterSpacingApplied: boolean | null
    readonly fontFamily: string
    readonly primaryFamily: string
  }[]
  readonly arabicTextOmitted: number
  readonly fontFaces: readonly {
    readonly family: string
    readonly status: string
    readonly weight: string
    readonly style: string
    readonly unicodeRange: string
  }[]
  readonly bidi: readonly {
    readonly selector: string
    readonly box: MeasuredBox
    readonly text: string
    readonly kind: 'number' | 'latin'
  }[]
  /** The time limit stopped the walk early. */
  readonly truncated: boolean
}

export const MEASURE_LIMITS: MeasureLimits = {
  maxNodes: 20_000,
  maxBlocks: 200,
  maxOverflow: 20,
  maxTokens: 500,
  maxBidi: 20,
  maxFontFaces: 100,
  textLength: 200,
  timeMs: 5_000,
}

export function measurePage(limits: MeasureLimits): Measured {
  const started = performance.now()
  let truncated = false
  const late = (): boolean => {
    if (performance.now() - started > limits.timeMs) truncated = true
    return truncated
  }
  const arabicLetter = /(?=\p{Script=Arabic})\p{L}/u
  const arabicWord = /(?:(?=\p{Script=Arabic})\p{L})+/gu
  const skipped = 'script,style,noscript,template,textarea,svg,math'
  const root = document.documentElement
  const body = document.body as HTMLElement | null
  const scrollX = window.scrollX
  const scrollY = window.scrollY

  const box = (rect: DOMRect): MeasuredBox => ({
    x: Math.round(rect.left + scrollX),
    y: Math.round(rect.top + scrollY),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  })

  /** A unique id, or tags with :nth-of-type up to one; at most 12 steps and 300 characters. */
  const selectorOf = (element: Element): string => {
    const parts: string[] = []
    let node = element
    for (;;) {
      if (node.id !== '' && document.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) {
        parts.unshift(`#${CSS.escape(node.id)}`)
        break
      }
      const tag = node.localName
      const parent = node.parentElement
      if (parent === null) {
        parts.unshift(tag)
        break
      }
      const same = Array.from(parent.children).filter((child) => child.localName === tag)
      parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag)
      if (parts.length >= 12) break
      node = parent
    }
    return parts.join(' > ').slice(-300)
  }

  const unquote = (family: string): string => family.trim().replace(/^(["'])(.*)\1$/, '$2')
  /** The first name of a computed font-family list; a quoted name may hold commas and escapes. */
  const primaryFamily = (list: string): string => {
    const text = list.trim()
    const quote = text[0]
    if (quote !== '"' && quote !== "'") return (text.split(',')[0] ?? '').trim()
    let name = ''
    for (let i = 1; i < text.length; i++) {
      const char = text.charAt(i)
      if (char === quote) break
      if (char === '\\') {
        i++
        name += text.charAt(i)
      } else name += char
    }
    return name
  }

  /** Whether letter-spacing changes the width of one Arabic word in this engine's hands. */
  const spacingApplied = (style: CSSStyleDeclaration, text: string): boolean | null => {
    const words = text.match(arabicWord) ?? []
    const word = words.reduce(
      (longest, next) => (next.length > longest.length ? next : longest),
      '',
    )
    if (word.length < 2 || body === null) return null
    const probe = document.createElement('span')
    probe.setAttribute('aria-hidden', 'true')
    const set = (name: string, value: string) => {
      probe.style.setProperty(name, value, 'important')
    }
    set('position', 'absolute')
    set('visibility', 'hidden')
    set('white-space', 'pre')
    set('top', '0')
    set('left', '0')
    set('direction', 'rtl')
    set('font-family', style.fontFamily)
    set('font-size', style.fontSize)
    set('font-weight', style.fontWeight)
    set('font-style', style.fontStyle)
    set('font-feature-settings', style.fontFeatureSettings)
    probe.textContent = word
    body.appendChild(probe)
    set('letter-spacing', style.letterSpacing)
    const spaced = probe.getBoundingClientRect().width
    set('letter-spacing', '0px')
    const plain = probe.getBoundingClientRect().width
    probe.remove()
    return Math.abs(spaced - plain) >= 0.5
  }

  // Text blocks with Arabic letters, and the out-of-order tokens in right-to-left text.
  const arabicText: Measured['arabicText'][number][] = []
  const bidi: Measured['bidi'][number][] = []
  let arabicTextOmitted = 0
  let tokens = 0
  const seen = new Set<Element>()
  const numberGroups =
    /\+?[0-9\u0660-\u0669\u06F0-\u06F9]+(?:[ \u00A0\u202F-][0-9\u0660-\u0669\u06F0-\u06F9]+)+|\+[0-9\u0660-\u0669\u06F0-\u06F9]+/gu
  const latinWithNeutrals = /[A-Za-z][A-Za-z0-9.]*[+#]+/g

  /** Characters of an LTR token must be drawn left to right, on one line. */
  const outOfOrder = (node: Text, start: number, length: number): DOMRect | null => {
    const range = document.createRange()
    let last = Number.NEGATIVE_INFINITY
    let top: number | null = null
    let broken = false
    for (let i = start; i < start + length; i++) {
      if (/\s/.test(node.data[i] ?? '')) continue
      range.setStart(node, i)
      range.setEnd(node, i + 1)
      const rect = range.getBoundingClientRect()
      if (rect.width === 0) continue
      if (top === null) top = rect.top
      else if (Math.abs(rect.top - top) > rect.height / 2) return null
      const center = rect.left + rect.width / 2
      if (center < last) broken = true
      last = center
    }
    if (!broken) return null
    range.setStart(node, start)
    range.setEnd(node, start + length)
    return range.getBoundingClientRect()
  }

  const measureTokens = (node: Text, parent: Element) => {
    for (const [pattern, kind] of [
      [numberGroups, 'number'],
      [latinWithNeutrals, 'latin'],
    ] as const) {
      pattern.lastIndex = 0
      for (const match of node.data.matchAll(pattern)) {
        if (tokens >= limits.maxTokens || bidi.length >= limits.maxBidi || late()) return
        // Phone numbers and words like C++ are short; a longer run is something else.
        if (match[0].length > 40) continue
        tokens++
        const rect = outOfOrder(node, match.index, match[0].length)
        if (rect !== null) {
          bidi.push({ selector: selectorOf(parent), box: box(rect), text: match[0], kind })
        }
      }
    }
  }

  if (body !== null) {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
    const direction = new Map<Element, string>()
    let visited = 0
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (++visited > limits.maxNodes || late()) {
        truncated = true
        break
      }
      const text = node as Text
      const parent = text.parentElement
      if (parent === null) continue
      if (parent.closest(skipped) !== null) continue
      if (/[+#0-9\u0660-\u0669\u06F0-\u06F9]/.test(text.data)) {
        let dir = direction.get(parent)
        if (dir === undefined) {
          dir = getComputedStyle(parent).direction
          direction.set(parent, dir)
        }
        if (dir === 'rtl') measureTokens(text, parent)
      }
      if (!arabicLetter.test(text.data) || seen.has(parent)) continue
      seen.add(parent)
      const rect = parent.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue
      if (arabicText.length >= limits.maxBlocks) {
        arabicTextOmitted++
        continue
      }
      const style = getComputedStyle(parent)
      const own = Array.from(parent.childNodes)
        .filter((child) => child.nodeType === Node.TEXT_NODE)
        .map((child) => (child as Text).data)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, limits.textLength)
      const spacing = Number.parseFloat(style.letterSpacing)
      const letterSpacing = Number.isFinite(spacing) ? Math.round(spacing * 100) / 100 : 0
      arabicText.push({
        selector: selectorOf(parent),
        box: box(rect),
        text: own,
        letterSpacing,
        letterSpacingApplied: letterSpacing === 0 ? null : spacingApplied(style, own),
        fontFamily: style.fontFamily.slice(0, 500),
        primaryFamily: primaryFamily(style.fontFamily).slice(0, 200),
      })
    }
  }

  // Elements that reach past the viewport, when the page scrolls sideways at all.
  // CSS Writing Modes 3 §8: an HTML page takes its direction from <body> when there is one, so
  // dir="rtl" on <body> alone makes the whole page right to left (M1.1 review).
  const pageDir = getComputedStyle(body ?? root).direction === 'rtl' ? 'rtl' : 'ltr'
  const clientWidth = root.clientWidth
  const scrollWidth = Math.max(root.scrollWidth, body?.scrollWidth ?? 0)
  const overflow: Measured['overflow'][number][] = []
  if (body !== null && scrollWidth > clientWidth + 1) {
    const clips = (element: Element): boolean => {
      for (let node = element.parentElement; node !== null && node !== body;) {
        const style = getComputedStyle(node)
        if (style.overflowX !== 'visible' || style.position === 'fixed') return true
        node = node.parentElement
      }
      return false
    }
    const recorded: Element[] = []
    const elements = body.getElementsByTagName('*')
    const count = Math.min(elements.length, limits.maxNodes)
    for (let i = 0; i < count && overflow.length < limits.maxOverflow && !late(); i++) {
      const element = elements[i]
      if (element === undefined) continue
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      // Only the end edge can be scrolled to; past the start edge is unreachable and clipped (CSS
      // Overflow 3 §2.2): the left edge in a right-to-left page, the right edge otherwise.
      if (pageDir === 'rtl' ? rect.left >= -1 : rect.right <= clientWidth + 1) continue
      if (recorded.some((outer) => outer.contains(element))) continue
      if (getComputedStyle(element).position === 'fixed' || clips(element)) continue
      recorded.push(element)
      overflow.push({ selector: selectorOf(element), box: box(rect) })
    }
  }

  const fontFaces: Measured['fontFaces'][number][] = []
  document.fonts.forEach((face) => {
    if (fontFaces.length >= limits.maxFontFaces) return
    fontFaces.push({
      family: unquote(face.family).slice(0, 200),
      status: face.status,
      weight: face.weight.slice(0, 50),
      style: face.style.slice(0, 50),
      unicodeRange: face.unicodeRange.slice(0, 2000),
    })
  })

  const viewportMeta = document.querySelector('meta[name="viewport" i]')
  return {
    dir: pageDir,
    lang: root.getAttribute('lang')?.slice(0, 100) ?? null,
    viewportMeta: viewportMeta?.getAttribute('content')?.slice(0, 500) ?? null,
    viewport: { width: clientWidth, height: root.clientHeight },
    scrollWidth,
    overflow,
    arabicText,
    arabicTextOmitted,
    fontFaces,
    bidi,
    truncated,
  }
}

/**
 * The script as source text for page.evaluate. TypeScript transforms may wrap inner functions
 * in a `__name` helper that exists only in Node; the page gets a stand-in.
 */
export function measureSource(limits: MeasureLimits = MEASURE_LIMITS): string {
  return `(() => { const __name = (target) => target; return (${measurePage.toString()})(${JSON.stringify(limits)}) })()`
}

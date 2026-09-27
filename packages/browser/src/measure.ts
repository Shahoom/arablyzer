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
  /** Text fields reported with their computed direction. */
  readonly maxFields: number
  readonly textLength: number
  /** Distinct Arabic-script characters kept for each block of Arabic text. */
  readonly maxCharacters: number
  /** Direction icons reported, and elements looked at for them. */
  readonly maxIcons: number
  readonly maxIconCandidates: number
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
    readonly arabicCharacters: string
  }[]
  readonly arabicTextOmitted: number
  readonly fontFaces: readonly {
    readonly family: string
    readonly status: string
    readonly weight: string
    readonly style: string
    readonly unicodeRange: string
  }[]
  readonly fontFacesOmitted: number
  readonly bidi: readonly {
    readonly selector: string
    readonly box: MeasuredBox
    readonly text: string
    readonly kind: 'number' | 'latin'
  }[]
  readonly fields: readonly {
    readonly selector: string
    readonly box: MeasuredBox
    readonly tag: 'input' | 'textarea'
    readonly type: string
    readonly name: string | null
    readonly id: string | null
    readonly autocomplete: readonly string[]
    readonly inputmode: string | null
    readonly placeholder: string | null
    readonly label: string | null
    readonly ariaLabel: string | null
    readonly dirAttribute: string | null
    readonly direction: string
    readonly unicodeBidi: string
  }[]
  readonly directionIcons: readonly {
    readonly selector: string
    readonly box: MeasuredBox
    readonly name: string
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
  maxFields: 200,
  textLength: 200,
  maxCharacters: 200,
  maxIcons: 20,
  maxIconCandidates: 3_000,
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

  /** In the Arabic script's blocks: Arabic, its Supplement, Extended-B and -A, presentation forms. */
  const inArabicBlocks = (codePoint: number): boolean =>
    (codePoint >= 0x600 && codePoint <= 0x6ff) ||
    (codePoint >= 0x750 && codePoint <= 0x77f) ||
    (codePoint >= 0x870 && codePoint <= 0x8ff) ||
    (codePoint >= 0xfb50 && codePoint <= 0xfdff) ||
    (codePoint >= 0xfe70 && codePoint <= 0xfeff)
  const formatOrUnassigned = /\p{Cf}|\p{Cn}/u
  /** A text's distinct Arabic-script characters in code point order, format characters left out. */
  const arabicCharactersOf = (text: string): string => {
    const found = new Set<number>()
    for (const char of text) {
      const codePoint = char.codePointAt(0) ?? 0
      if (!inArabicBlocks(codePoint) || found.has(codePoint) || formatOrUnassigned.test(char)) {
        continue
      }
      found.add(codePoint)
      if (found.size >= limits.maxCharacters) break
    }
    return String.fromCodePoint(...Array.from(found).sort((a, b) => a - b))
  }
  // Arrows that point right and, unlike ‹ › « », are not mirrored in right-to-left text:
  // → ⇒ ⟶ ➔ ➜ ➝ ➞ ➡ ➢ ➣ ➤ ⭢ ⮕.
  const rightArrow = new RegExp(
    `[${String.fromCodePoint(0x2192, 0x21d2, 0x27f6, 0x2794, 0x279c, 0x279d, 0x279e, 0x27a1, 0x27a2, 0x27a3, 0x27a4, 0x2b62, 0x2b95)}]`,
    'u',
  )

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
  const arrows: { readonly node: Text; readonly index: number; readonly arrow: string }[] = []
  // Numbers in groups (+966 50 123 4567, 1 500), and phone numbers written with + and at least
  // 8 digits. A short number after + ("+500 clients") reads as "500+" either way (M1.1 review).
  const numberGroups =
    /\+?[0-9\u0660-\u0669\u06F0-\u06F9]+(?:[ \u00A0\u202F-][0-9\u0660-\u0669\u06F0-\u06F9]+)+|\+[0-9\u0660-\u0669\u06F0-\u06F9]{8,}/gu
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
      if (arrows.length < limits.maxIcons * 5 && arabicLetter.test(text.data)) {
        const arrow = rightArrow.exec(text.data)
        if (arrow !== null && parent.closest('code, pre, kbd, samp') === null) {
          arrows.push({ node: text, index: arrow.index, arrow: arrow[0] })
        }
      }
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
      const full = Array.from(parent.childNodes)
        .filter((child) => child.nodeType === Node.TEXT_NODE)
        .map((child) => (child as Text).data)
        .join(' ')
      const own = full.replace(/\s+/g, ' ').trim().slice(0, limits.textLength)
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
        arabicCharacters: arabicCharactersOf(full),
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
  let fontFacesOmitted = 0
  document.fonts.forEach((face) => {
    if (fontFaces.length >= limits.maxFontFaces) {
      fontFacesOmitted++
      return
    }
    fontFaces.push({
      family: unquote(face.family).slice(0, 200),
      status: face.status,
      weight: face.weight.slice(0, 50),
      style: face.style.slice(0, 50),
      unicodeRange: face.unicodeRange.slice(0, 2000),
    })
  })

  // Text fields with their computed direction: a phone number typed right to left shows reversed.
  const NOT_TEXT = new Set([
    'hidden',
    'checkbox',
    'radio',
    'file',
    'image',
    'range',
    'color',
    'submit',
    'reset',
    'button',
  ])
  const fields: Measured['fields'][number][] = []
  const attribute = (element: Element, name: string, length = 200): string | null =>
    element.getAttribute(name)?.slice(0, length) ?? null
  for (const element of Array.from(document.querySelectorAll('input, textarea'))) {
    if (fields.length >= limits.maxFields || late()) break
    const input = element as HTMLInputElement | HTMLTextAreaElement
    const tag = input.localName === 'textarea' ? 'textarea' : 'input'
    const type = tag === 'textarea' ? 'textarea' : (input as HTMLInputElement).type
    if (NOT_TEXT.has(type)) continue
    const style = getComputedStyle(input)
    // null for some input types, although the DOM types say otherwise.
    const labelList: unknown = input.labels
    const labels = (labelList instanceof NodeList ? Array.from(labelList) : [])
      .map((label) => (label.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter((text) => text !== '')
      .join(' ')
    fields.push({
      selector: selectorOf(input),
      box: box(input.getBoundingClientRect()),
      tag,
      type: type.slice(0, 50),
      name: attribute(input, 'name'),
      id: attribute(input, 'id'),
      autocomplete: (attribute(input, 'autocomplete') ?? '')
        .toLowerCase()
        .split(/\s+/)
        .filter((token) => token !== ''),
      inputmode: attribute(input, 'inputmode', 50)?.toLowerCase() ?? null,
      placeholder: attribute(input, 'placeholder'),
      label: labels === '' ? null : labels.slice(0, 200),
      ariaLabel: attribute(input, 'aria-label'),
      dirAttribute: attribute(input, 'dir', 20)?.toLowerCase() ?? null,
      direction: style.direction,
      unicodeBidi: style.unicodeBidi.slice(0, 50),
    })
  }

  // Direction icons drawn as for left-to-right text in right-to-left text: icon-font classes,
  // Material ligatures, and arrows beside Arabic words (docs/design/plans/m1.2c-css-fonts.md §2).
  const ICON_CLASS =
    /^(?:fa[srlbd]?|bi|lucide|feather|ti|ri|ph|bxs?|mdi|la[srb]?|icon|glyphicon|ion(?:-md|-ios)?)-([a-z0-9-]+)$/
  const ICON_SHAPES = new Set([
    'arrow',
    'arrows',
    'chevron',
    'chevrons',
    'caret',
    'angle',
    'angles',
  ])
  const FORWARD = new Set(['right', 'forward', 'next'])
  const NOT_FORWARD = new Set(['left', 'back', 'prev', 'previous', 'up', 'down', 'rotate', 'turn'])
  const MATERIAL = /^material-(?:icons|symbols)(?:-[a-z]+)?$/
  const MATERIAL_FORWARD = new Set([
    'arrow_forward',
    'arrow_forward_ios',
    'arrow_right',
    'arrow_right_alt',
    'chevron_right',
    'navigate_next',
    'keyboard_arrow_right',
    'keyboard_double_arrow_right',
    'double_arrow',
    'east',
    'last_page',
  ])
  const iconName = (element: Element): string | null => {
    for (const token of Array.from(element.classList)) {
      const lower = token.toLowerCase()
      if (MATERIAL.test(lower)) {
        const ligature = element.textContent.trim().toLowerCase()
        if (MATERIAL_FORWARD.has(ligature)) return ligature
        continue
      }
      const words = ICON_CLASS.exec(lower)?.[1]?.split('-') ?? []
      if (
        words.some((word) => ICON_SHAPES.has(word)) &&
        words.some((word) => FORWARD.has(word)) &&
        !words.some((word) => NOT_FORWARD.has(word))
      ) {
        return token.slice(0, 100)
      }
    }
    return null
  }
  /** -1 when a style turns what it draws around its vertical axis. */
  const mirrorSign = (style: CSSStyleDeclaration): number => {
    let sign = 1
    const matrix = /^matrix(?:3d)?\(\s*(-?[\d.]+(?:e[+-]?\d+)?)/.exec(style.transform)
    if (matrix !== null && Number(matrix[1]) < 0) sign = -sign
    const scale = style.getPropertyValue('scale')
    if (scale !== '' && scale !== 'none' && Number.parseFloat(scale) < 0) sign = -sign
    if (/(?:^|\s)180deg$/.test(style.getPropertyValue('rotate'))) sign = -sign
    return sign
  }
  /** Mirrored by a transform on it, on its ::before or ::after, or on up to three ancestors. */
  const mirrored = (element: Element): boolean => {
    let sign =
      mirrorSign(getComputedStyle(element, '::before')) *
      mirrorSign(getComputedStyle(element, '::after'))
    let node: Element | null = element
    for (let depth = 0; node !== null && depth < 4; depth++) {
      sign *= mirrorSign(getComputedStyle(node))
      node = node.parentElement
    }
    return sign < 0
  }
  const directionIcons: Measured['directionIcons'][number][] = []
  const looked = new Set<Element>()
  const addIcon = (element: Element, name: string, rect: DOMRect) => {
    if (looked.has(element)) return
    looked.add(element)
    if (rect.width === 0 || rect.height === 0) return
    if (getComputedStyle(element).direction !== 'rtl' || mirrored(element)) return
    directionIcons.push({ selector: selectorOf(element), box: box(rect), name })
  }
  if (body !== null) {
    const candidates = body.querySelectorAll(
      '[class*="right" i], [class*="forward" i], [class*="next" i], [class*="material-" i]',
    )
    const count = Math.min(candidates.length, limits.maxIconCandidates)
    for (let i = 0; i < count && directionIcons.length < limits.maxIcons && !late(); i++) {
      const element = candidates[i]
      const name = element === undefined ? null : iconName(element)
      if (element !== undefined && name !== null) {
        addIcon(element, name, element.getBoundingClientRect())
      }
    }
  }
  for (const { node, index, arrow } of arrows) {
    if (directionIcons.length >= limits.maxIcons || late()) break
    const parent = node.parentElement
    if (parent === null) continue
    const range = document.createRange()
    range.setStart(node, index)
    range.setEnd(node, index + arrow.length)
    addIcon(parent, arrow, range.getBoundingClientRect())
  }

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
    fontFacesOmitted,
    bidi,
    fields,
    directionIcons,
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

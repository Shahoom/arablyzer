/// <reference lib="dom" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { A11yFacts, A11yRuleId } from '@arablyzer/collectors'
import { z } from 'zod'

/**
 * The axe-core rules Arablyzer reports, each through a rule of its own with fixtures and Arabic
 * copy (Phase 1 design §3); axe's other rules do not run. axe-core is pinned: the seed below rests
 * on its internals, and the fixtures fail if an update changes them.
 */
export const AXE_RULES: readonly A11yRuleId[] = [
  'image-alt',
  'color-contrast',
  'link-name',
  'button-name',
  'valid-lang',
  'label',
]

export interface AxeLimits {
  /** Elements kept per rule and result type; the rest are counted. */
  readonly maxNodes: number
  readonly snippetLength: number
  /** Text nodes looked at for the fonts of Arabic text. */
  readonly maxTextNodes: number
}

export const AXE_LIMITS: AxeLimits = { maxNodes: 20, snippetLength: 200, maxTextNodes: 20_000 }

let source: string | undefined
let version: string | undefined

/** axe-core's browser build, read once per process: from this package, or next to the CLI. */
export function axeSource(): string {
  source ??= readFileSync(fileURLToPath(import.meta.resolve('axe-core/axe.min.js')), 'utf8')
  return source
}

export function axeVersion(): string {
  if (version === undefined) {
    const manifest: unknown = JSON.parse(
      readFileSync(fileURLToPath(import.meta.resolve('axe-core/package.json')), 'utf8'),
    )
    version =
      typeof manifest === 'object' && manifest !== null && 'version' in manifest
        ? String(manifest.version)
        : 'unknown'
  }
  return version
}

interface AxeNode {
  readonly element?: Element
  readonly target: readonly unknown[]
  readonly html: string
  readonly any: readonly { readonly data?: unknown }[]
  readonly all: readonly { readonly data?: unknown }[]
  readonly none: readonly { readonly data?: unknown }[]
}

interface AxeResult {
  readonly id: string
  readonly nodes: readonly AxeNode[]
}

interface Axe {
  readonly _cache: { set(key: string, value: unknown): void }
  run(
    context: Document,
    options: Record<string, unknown>,
  ): Promise<{ violations: AxeResult[]; incomplete: AxeResult[]; inapplicable: AxeResult[] }>
}

/**
 * Runs in the page, after axe's source: it must stay self-contained, as the measuring script does,
 * and it runs in the page's own world, so a page can falsify its own results and only its own.
 *
 * axe-core's color-contrast leaves out text it takes for icon-font ligatures, and it takes Arabic
 * for them: isIconLigature draws a text's first character alone at the left edge and compares it
 * with the whole text, where an Arabic sentence starts at the right, joined; after three such text
 * nodes in one font family it leaves out every text in that font, English too (measured
 * 2026-09-27, docs/design/plans/m1.2b-axe-forms.md §0). So the fonts of text nodes with Arabic
 * letters are seeded in axe's font cache as seen and never a ligature. Icon fonts, whose
 * ligatures are Latin names, keep axe's check.
 *
 * Two more things keep axe's contrast from failing text that is fine (2026-10, the first live
 * report: white text on a dark card, measured as #ffffff on #fdfdfd, in all three engines):
 * - axe finds what is behind text from where elements are. A page that draws sections only as they
 *   near the screen (content-visibility: auto) gives a section the size of a placeholder until
 *   then, so other sections lie where its text is, and axe took the white card of the next one
 *   for the background. While axe runs, content-visibility is visible everywhere.
 * - A violation is kept only when something agrees with it. Where the elements the text sits in
 *   would paint a background it passes, or where the text lies over a layer that is not one of
 *   them (a positioned dark layer, an image) and they paint none, what axe measured is not the
 *   background, and the text goes to the checks for a human eye (`bgOverlap`).
 */
export async function runAxeInPage(
  rules: readonly string[],
  limits: AxeLimits,
): Promise<{ rules: unknown[] }> {
  const axe = (window as unknown as { axe: Axe }).axe
  const arabic = /\p{Script=Arabic}/u
  const families: Record<string, { occurrences: number; numLigatures: number }> = {}
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (
    let seen = 0, node = walker.nextNode();
    node !== null && seen < limits.maxTextNodes;
    seen++
  ) {
    const parent = node.parentElement
    if (parent !== null && arabic.test(node.nodeValue ?? '')) {
      const family = getComputedStyle(parent).getPropertyValue('font-family')
      families[family] = { occurrences: 3, numLigatures: 0 }
    }
    node = walker.nextNode()
  }
  axe._cache.set('fonts', families)

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null
  const text = (value: unknown): string => (typeof value === 'string' ? value : '')

  type Rgba = [number, number, number, number]

  /** A colour as the browsers write a computed one (rgb, rgba, hex); null for one in any other notation. */
  function parseColor(value: string): Rgba | null {
    const written = value.trim().toLowerCase()
    if (written === 'transparent') return [0, 0, 0, 0]
    const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(written)
    if (hex !== null) {
      const number = parseInt(hex[1] ?? '0', 16)
      const alpha = hex[2] === undefined ? 1 : parseInt(hex[2], 16) / 255
      return [(number >> 16) & 255, (number >> 8) & 255, number & 255, alpha]
    }
    const parts = /^rgba?\(([^)]+)\)$/
      .exec(written)?.[1]
      ?.split(/[\s,/]+/)
      .filter(Boolean)
    if (parts === undefined || parts.length < 3) return null
    const [red, green, blue, alpha] = parts.map((part) =>
      part.endsWith('%') ? parseFloat(part) / 100 : parseFloat(part),
    )
    const percent = parts[0]?.endsWith('%') === true
    if (red === undefined || green === undefined || blue === undefined) return null
    const channels: Rgba = [
      percent ? red * 255 : red,
      percent ? green * 255 : green,
      percent ? blue * 255 : blue,
      alpha ?? 1,
    ]
    return channels.some((channel) => Number.isNaN(channel)) ? null : channels
  }

  /** `top` drawn over `below`. */
  function composite(top: Rgba, below: Rgba): Rgba {
    const alpha = top[3] + below[3] * (1 - top[3])
    if (alpha === 0) return [0, 0, 0, 0]
    const mix = (index: 0 | 1 | 2) =>
      (top[index] * top[3] + below[index] * below[3] * (1 - top[3])) / alpha
    return [mix(0), mix(1), mix(2), alpha]
  }

  /** WCAG's contrast ratio of two opaque colours. */
  function ratioOf(one: Rgba, other: Rgba): number {
    const light = (colour: Rgba) => {
      const [red, green, blue] = [colour[0], colour[1], colour[2]].map((channel) => {
        const unit = channel / 255
        return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0)
    }
    const [high, low] = [light(one), light(other)].sort((a, b) => b - a)
    return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05)
  }

  /**
   * What the elements a text sits in paint behind it, from the page's white up: null where one
   * has an image or a colour this cannot read. `bare` is true where none of them but the page's own
   * (html, body) paints anything: the text has only the page behind it, as far as they say.
   */
  function surfaceBehind(element: Element): { surface: Rgba | null; bare: boolean } {
    const styles: CSSStyleDeclaration[] = []
    let bare = true
    for (let node: Element | null = element; node !== null; node = node.parentElement) {
      const style = getComputedStyle(node)
      styles.push(style)
      const color = parseColor(style.backgroundColor)
      const ofPage = node === document.documentElement || node === document.body
      if (!ofPage && (style.backgroundImage !== 'none' || color === null || color[3] > 0)) {
        bare = false
      }
    }
    let surface: Rgba | null = [255, 255, 255, 1]
    for (const style of styles.reverse()) {
      const color = parseColor(style.backgroundColor)
      if (style.backgroundImage !== 'none' || color === null) {
        surface = null
        break
      }
      surface = composite(color, surface)
    }
    return { surface, bare }
  }

  const MAX_DOUBTS_CHECKED = 40
  const MAX_LAYER_SCAN = 40_000

  /**
   * The color-contrast violations whose background cannot be what axe says it is (see above): the
   * ones the elements a text sits in would pass, and the ones where the elements paint nothing and
   * another element, drawn over the text's place and not one of its own, paints an image or a colour.
   */
  function contrastDoubts(nodes: readonly AxeNode[]): AxeNode[] {
    const doubts: AxeNode[] = []
    let layers: { element: Element; rect: DOMRect }[] | null = null
    const layersOnPage = () => {
      if (layers !== null) return layers
      const found: { element: Element; rect: DOMRect }[] = []
      const all = document.body.querySelectorAll('*')
      for (let index = 0; index < Math.min(all.length, MAX_LAYER_SCAN); index++) {
        const element = all[index]
        if (element === undefined) continue
        const style = getComputedStyle(element)
        if (style.display === 'none' || style.visibility === 'hidden') continue
        if (parseFloat(style.opacity) === 0) continue
        const color = parseColor(style.backgroundColor)
        const drawn = /^(?:img|video|canvas|picture|svg|iframe|object|embed)$/i.test(
          element.tagName,
        )
        if (!drawn && style.backgroundImage === 'none' && color !== null && color[3] === 0) continue
        const rect = element.getBoundingClientRect()
        if (rect.width >= 1 && rect.height >= 1) found.push({ element, rect })
      }
      layers = found
      return found
    }
    const overLayer = (element: Element): boolean => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0)
      const own = rects.length > 0 ? rects : [element.getBoundingClientRect()]
      return layersOnPage().some(
        (layer) =>
          !layer.element.contains(element) &&
          !element.contains(layer.element) &&
          own.some(
            (rect) =>
              Math.min(rect.right, layer.rect.right) - Math.max(rect.left, layer.rect.left) > 1 &&
              Math.min(rect.bottom, layer.rect.bottom) - Math.max(rect.top, layer.rect.top) > 1,
          ),
      )
    }
    for (const node of nodes.slice(0, MAX_DOUBTS_CHECKED)) {
      const element = node.element
      if (element === undefined) continue
      const record =
        [...node.any, ...node.all, ...node.none].map((check) => check.data).find(isRecord) ?? {}
      const foreground = parseColor(text(record.fgColor))
      const expected = Number(text(record.expectedContrastRatio).replace(':1', '')) || 4.5
      const { surface, bare } = surfaceBehind(element)
      const passes =
        surface !== null &&
        foreground !== null &&
        ratioOf(composite(foreground, surface), surface) >= expected
      if (passes || (bare && overLayer(element))) doubts.push(node)
    }
    return doubts
  }

  // A constructed style sheet, which a page's content security policy does not govern as it does
  // a <style> element. The selector is as specific as can be, so no rule of the page's wins.
  let unskip: CSSStyleSheet | undefined
  try {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(':not(#a):not(#a):not(#a):not(#a) { content-visibility: visible !important }')
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
    unskip = sheet
  } catch {
    // Where the engine has no constructed style sheets, axe reads the page as it is drawn.
  }

  let result: Awaited<ReturnType<Axe['run']>>
  let doubtful: readonly AxeNode[] = []
  try {
    result = await axe.run(document, {
      runOnly: { type: 'rule', values: rules },
      resultTypes: ['violations', 'incomplete'],
      iframes: false,
      elementRef: true,
      selectors: true,
      ancestry: false,
      xpath: false,
      performanceTimer: false,
    })
    try {
      doubtful = contrastDoubts(
        result.violations.find((item) => item.id === 'color-contrast')?.nodes ?? [],
      )
    } catch {
      // Without the check, axe's violations stand as they are.
      doubtful = []
    }
  } finally {
    if (unskip !== undefined) {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((sheet) => sheet !== unskip)
    }
  }

  const compact = (node: AxeNode, reason?: string) => {
    const checks = [...node.any, ...node.all, ...node.none]
    const record = checks.map((check) => check.data).find(isRecord) ?? {}
    const contrast =
      reason === undefined && typeof record.contrastRatio === 'number' && record.contrastRatio > 0
        ? {
            foreground: text(record.fgColor).slice(0, 30),
            background: text(record.bgColor).slice(0, 30),
            ratio: Math.round(record.contrastRatio * 100) / 100,
            // axe writes the ratio it expected as "4.5:1".
            expected: Number(text(record.expectedContrastRatio).replace(':1', '')) || 0,
          }
        : null
    return {
      selector: node.target.map(String).join(' ').slice(-300),
      snippet: node.html.replace(/\s+/g, ' ').slice(0, limits.snippetLength),
      reason:
        reason ?? (typeof record.messageKey === 'string' ? record.messageKey.slice(0, 50) : null),
      contrast,
    }
  }
  const nodesOf = (list: readonly AxeResult[], id: string) =>
    list.find((item) => item.id === id)?.nodes ?? []
  return {
    rules: rules.map((id) => {
      // The violations axe's measure of the background was doubted for are asked of a person.
      const doubted = id === 'color-contrast' ? doubtful : []
      const violations = nodesOf(result.violations, id).filter((node) => !doubted.includes(node))
      const incomplete = nodesOf(result.incomplete, id)
      return {
        id,
        applicable: !result.inapplicable.some((item) => item.id === id),
        violations: violations.slice(0, limits.maxNodes).map((node) => compact(node)),
        violationCount: violations.length,
        incomplete: [
          ...incomplete.slice(0, limits.maxNodes).map((node) => compact(node)),
          ...doubted.slice(0, limits.maxNodes).map((node) => compact(node, 'bgOverlap')),
        ].slice(0, limits.maxNodes),
        incompleteCount: incomplete.length + doubted.length,
      }
    }),
  }
}

/** The runner as source text for page.evaluate, with axe already on the page (see measureSource). */
export function axeRunnerSource(
  rules: readonly string[] = AXE_RULES,
  limits: AxeLimits = AXE_LIMITS,
): string {
  return `(() => { const __name = (target) => target; return (${runAxeInPage.toString()})(${JSON.stringify(rules)}, ${JSON.stringify(limits)}) })()`
}

const A11yNode = z.strictObject({
  selector: z.string().max(300),
  snippet: z.string().max(AXE_LIMITS.snippetLength),
  reason: z.string().max(50).nullable(),
  contrast: z
    .strictObject({
      foreground: z.string().max(30),
      background: z.string().max(30),
      ratio: z.number().min(0).max(21),
      expected: z.number().min(0).max(21),
    })
    .nullable(),
})

const A11yResult = z.strictObject({
  rules: z
    .array(
      z.strictObject({
        id: z.enum([
          'image-alt',
          'color-contrast',
          'link-name',
          'button-name',
          'valid-lang',
          'label',
        ]),
        applicable: z.boolean(),
        violations: z.array(A11yNode).max(AXE_LIMITS.maxNodes),
        violationCount: z.number().int().min(0).max(10_000_000),
        incomplete: z.array(A11yNode).max(AXE_LIMITS.maxNodes),
        incompleteCount: z.number().int().min(0).max(10_000_000),
      }),
    )
    .max(AXE_RULES.length),
})

/** The runner's result as facts; throws when it is not what the runner returns. */
export function toA11yFacts(result: unknown): A11yFacts {
  return { axeVersion: axeVersion(), rules: A11yResult.parse(result).rules }
}

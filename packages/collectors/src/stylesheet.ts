import { parse, walk, type CssNode, type Declaration } from 'css-tree'
import { ALL_CODE_POINTS, parseUnicodeRange, type CodePointRange } from './code-points'
import { fontCoverage } from './font-coverage'

/** A font an @font-face rule loads: a URL, or a font inlined as a data: URL and read here. */
export type FontSource =
  | { readonly kind: 'url'; readonly url: string }
  | { readonly kind: 'data'; readonly coverage: readonly CodePointRange[] | null }

/** An @font-face rule (CSS Fonts 4 §4). */
export interface FontFaceRule {
  /** Unquoted, as written; CSS matches family names without regard to case. */
  readonly family: string
  /** Its src fonts in order; local() fonts are left out. */
  readonly sources: readonly FontSource[]
  /** All of Unicode when the rule sets none or one the browser ignores as invalid. */
  readonly unicodeRange: readonly CodePointRange[]
}

/** A declaration that sets a side by left or right. */
export interface PhysicalDeclaration {
  readonly selector: string
  readonly property: string
  readonly value: string
  /** In the stylesheet's own text, from 1. */
  readonly line: number
  readonly column: number
}

export interface StylesheetFacts {
  readonly fontFaces: readonly FontFaceRule[]
  /** The first physical declarations, in the order of the text. */
  readonly physical: readonly PhysicalDeclaration[]
  readonly physicalCount: number
  /** The text could not be read in full (nesting too deep for the parser). */
  readonly incomplete: boolean
}

export interface StylesheetLimits {
  readonly maxExamples: number
  readonly maxFontFaces: number
  readonly maxSources: number
}

export const STYLESHEET_LIMITS: StylesheetLimits = {
  maxExamples: 3,
  maxFontFaces: 500,
  maxSources: 10,
}

const MAX_SELECTOR = 200
const MAX_VALUE = 100
/** A font inlined as a data: URL is read up to this size; a render keeps font files up to it. */
const MAX_DATA_FONT = 5 * 1024 * 1024

/** Properties that name a physical side, each with the one opposite it (CSS Logical 1 §4–7). */
const OPPOSITES = new Map<string, string>()
for (const [left, right] of [
  ['margin-left', 'margin-right'],
  ['padding-left', 'padding-right'],
  ['border-left', 'border-right'],
  ['border-left-width', 'border-right-width'],
  ['border-left-style', 'border-right-style'],
  ['border-left-color', 'border-right-color'],
  ['border-top-left-radius', 'border-top-right-radius'],
  ['border-bottom-left-radius', 'border-bottom-right-radius'],
  ['left', 'right'],
] as const) {
  OPPOSITES.set(left, right)
  OPPOSITES.set(right, left)
}
/** Properties whose left and right values have logical ones: start and end (inline-start…). */
const PHYSICAL_VALUES = new Set(['float', 'clear', 'text-align'])

/**
 * Rules written for one direction or language on purpose: `[dir="rtl"]`, `:dir(rtl)`, the
 * common `.rtl` and `.ltr` classes, `:lang()` and `[lang…]`.
 */
const SCOPED =
  /\[\s*dir\s*[~|^$*]?=|:dir\(|\.(?:rtl|ltr)(?![\w-])|:lang\(|\[\s*(?:xml:)?lang\s*[~|^$*]?=/i
const KEYFRAMES = /^(?:-[a-z]+-)?keyframes$/i
/** At-rules whose blocks hold descriptors, not style declarations. */
const DESCRIPTOR_RULES =
  /^(?:font-face|page|counter-style|font-feature-values|font-palette-values|property|view-transition|color-profile)$/i

interface Frame {
  readonly node: CssNode
  /** Inside a style rule, whose declarations style elements. */
  readonly styling: boolean
  /** Written for one direction or language, inside @keyframes, or holding descriptors. */
  readonly skipped: boolean
  readonly selector: string
}

/**
 * The @font-face rules of a stylesheet and its declarations that set a side by left or right,
 * with css-tree (MIT), which reads CSS as browsers do and recovers from errors the same way.
 * Declarations are left out when their rule is written for one direction or language, when the
 * same block sets its direction, and in pairs that set both sides alike (`left: 0; right: 0`).
 */
export function readStylesheet(
  text: string,
  baseUrl: string,
  limits: StylesheetLimits = STYLESHEET_LIMITS,
): StylesheetFacts {
  const fontFaces: FontFaceRule[] = []
  const physical: PhysicalDeclaration[] = []
  let physicalCount = 0
  let incomplete = false
  const frames: Frame[] = []
  try {
    const ast = parse(text, {
      positions: true,
      parseValue: false,
      parseRulePrelude: false,
      parseAtrulePrelude: false,
      parseCustomProperty: false,
      onParseError: () => undefined,
    })
    walk(ast, {
      enter(node: CssNode) {
        const parent = frames.at(-1)
        if (node.type === 'Rule') {
          const selector = node.prelude.type === 'Raw' ? collapse(node.prelude.value) : ''
          frames.push({
            node,
            styling: true,
            skipped: (parent?.skipped ?? false) || SCOPED.test(selector),
            selector,
          })
        } else if (node.type === 'Atrule') {
          if (node.name.toLowerCase() === 'font-face' && fontFaces.length < limits.maxFontFaces) {
            const rule = fontFace(node.block?.children.toArray() ?? [], baseUrl, limits)
            if (rule !== null) fontFaces.push(rule)
          }
          frames.push({
            node,
            styling: parent?.styling ?? false,
            skipped:
              (parent?.skipped ?? false) ||
              KEYFRAMES.test(node.name) ||
              DESCRIPTOR_RULES.test(node.name),
            selector: parent?.selector ?? '',
          })
        } else if (node.type === 'Block' && parent !== undefined) {
          if (!parent.styling || parent.skipped) return
          const declarations = node.children
            .toArray()
            .filter((child): child is Declaration => child.type === 'Declaration')
          for (const declaration of physicalIn(declarations)) {
            physicalCount++
            if (physical.length < limits.maxExamples) {
              physical.push({
                selector: parent.selector.slice(0, MAX_SELECTOR),
                property: declaration.property.toLowerCase(),
                value: valueOf(declaration).slice(0, MAX_VALUE),
                line: declaration.loc?.start.line ?? 0,
                column: declaration.loc?.start.column ?? 0,
              })
            }
          }
        }
      },
      leave(node: CssNode) {
        if (node.type === 'Rule' || node.type === 'Atrule') frames.pop()
      },
    })
  } catch {
    // Nesting deeper than the parser's stack: what was read so far stands.
    incomplete = true
  }
  return { fontFaces, physical, physicalCount, incomplete }
}

/** The declarations of one block that set a side by left or right. */
function physicalIn(declarations: readonly Declaration[]): Declaration[] {
  const last = new Map<string, string>()
  for (const declaration of declarations) {
    last.set(declaration.property.toLowerCase(), valueOf(declaration).toLowerCase())
  }
  // A block that sets its own direction places its sides for that direction on purpose.
  if (last.has('direction')) return []
  return declarations.filter((declaration) => {
    const property = declaration.property.toLowerCase()
    const opposite = OPPOSITES.get(property)
    if (opposite !== undefined) return last.get(opposite) !== last.get(property)
    if (!PHYSICAL_VALUES.has(property) || declaration.value.type !== 'Raw') return false
    const value = collapse(declaration.value.value).toLowerCase()
    return value === 'left' || value === 'right'
  })
}

function valueOf(declaration: Declaration): string {
  const value = declaration.value.type === 'Raw' ? collapse(declaration.value.value) : ''
  return declaration.important === false ? value : `${value} !important`
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function fontFace(
  children: readonly CssNode[],
  baseUrl: string,
  limits: StylesheetLimits,
): FontFaceRule | null {
  let family: string | null = null
  let sources: FontSource[] = []
  let unicodeRange: readonly CodePointRange[] = ALL_CODE_POINTS
  for (const child of children) {
    if (child.type !== 'Declaration' || child.value.type !== 'Raw') continue
    const raw = child.value.value
    const name = child.property.toLowerCase()
    // The last of each descriptor counts, as with properties.
    if (name === 'font-family') family = familyName(raw)
    else if (name === 'src') sources = fontSources(raw, baseUrl, limits.maxSources)
    else if (name === 'unicode-range') unicodeRange = parseUnicodeRange(raw) ?? ALL_CODE_POINTS
  }
  return family === null ? null : { family, sources, unicodeRange }
}

/** A family name: one string, or identifiers joined by single spaces (CSS Fonts 4 §2.1). */
function familyName(raw: string): string | null {
  const nodes = valueNodes(raw)
  if (nodes === null) return null
  const [first] = nodes
  if (nodes.length === 1 && first?.type === 'String') return first.value
  const words: string[] = []
  for (const node of nodes) {
    if (node.type === 'Identifier') words.push(node.name)
    else if (node.type !== 'WhiteSpace') return null
  }
  return words.length === 0 ? null : words.join(' ')
}

/** The url() fonts of a src descriptor, in order, resolved; data: fonts are read here. */
function fontSources(raw: string, baseUrl: string, max: number): FontSource[] {
  const sources: FontSource[] = []
  const nodes = valueNodes(raw)
  if (nodes === null) return sources
  for (const node of nodes) {
    if (sources.length >= max) break
    if (node.type !== 'Url') continue
    if (/^\s*data:/i.test(node.value)) {
      sources.push({ kind: 'data', coverage: dataFontCoverage(node.value) })
      continue
    }
    try {
      // The browser asks for the URL without its fragment (an SVG font's #id).
      const url = new URL(node.value, baseUrl)
      url.hash = ''
      sources.push({ kind: 'url', url: url.href })
    } catch {
      // A URL that does not resolve loads nothing.
    }
  }
  return sources
}

function valueNodes(raw: string): CssNode[] | null {
  try {
    const value = parse(raw, { context: 'value', onParseError: () => undefined })
    return value.type === 'Value' ? value.children.toArray() : null
  } catch {
    return null
  }
}

/**
 * The coverage of a font inlined as a base64 data: URL. Fonts are binary, so one inlined any
 * other way is left unread.
 */
function dataFontCoverage(url: string): readonly CodePointRange[] | null {
  const comma = url.indexOf(',')
  if (comma === -1 || !/;\s*base64\s*$/i.test(url.slice(0, comma))) return null
  const body = url.slice(comma + 1)
  // Base64 of MAX_DATA_FONT bytes is 4/3 as long.
  if (body.length > Math.ceil((MAX_DATA_FONT * 4) / 3) + 4) return null
  return fontCoverage(Buffer.from(body, 'base64'))
}

const CHARSET = /^@charset "([^"]{1,40})";/

/**
 * A stylesheet's text from its bytes (CSS Syntax 3 §3.2): a byte order mark, else the charset of
 * its Content-Type, else its @charset rule, else UTF-8. Bytes an encoding cannot decode become
 * U+FFFD, as in browsers.
 */
export function decodeStylesheet(bytes: Uint8Array, contentType: string | null): string {
  const labels: string[] = []
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) labels.push('utf-8')
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) labels.push('utf-16be')
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) labels.push('utf-16le')
  const declared = /;\s*charset\s*=\s*"?([^";\s]+)/i.exec(contentType ?? '')?.[1]
  if (declared !== undefined) labels.push(declared)
  const rule = CHARSET.exec(new TextDecoder('latin1').decode(bytes.subarray(0, 64)))?.[1]
  // A stylesheet that says it is UTF-16 in ASCII bytes is not: CSS Syntax 3 reads it as UTF-8.
  if (rule !== undefined) labels.push(/^utf-16/i.test(rule) ? 'utf-8' : rule)
  for (const label of labels) {
    try {
      return new TextDecoder(label).decode(bytes)
    } catch {
      // An unknown label: the next source decides.
    }
  }
  return new TextDecoder('utf-8').decode(bytes)
}

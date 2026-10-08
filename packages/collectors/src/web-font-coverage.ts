import {
  ALL_CODE_POINTS,
  intersectRanges,
  mergeRanges,
  parseUnicodeRange,
  type CodePointRange,
} from './code-points'
import type { FontFaceFact } from './rendered'
import type { FontFaceRule } from './stylesheet'

/**
 * The Unicode blocks of the Arabic script: Arabic, Arabic Supplement, Extended-B and -A, and the
 * presentation forms.
 */
export const ARABIC_BLOCKS: readonly CodePointRange[] = [
  [0x0600, 0x06ff],
  [0x0750, 0x077f],
  [0x0870, 0x08ff],
  [0xfb50, 0xfdff],
  [0xfe70, 0xfeff],
]

/**
 * What the coverage keeps of a font: the Arabic blocks, and U+20C1, the Saudi Riyal sign, which a
 * font may lack although it has every Arabic letter (docs/design/plans/arabic-native.md §3).
 */
const KEPT_BLOCKS: readonly CodePointRange[] = mergeRanges([...ARABIC_BLOCKS, [0x20c1, 0x20c1]])

/** A web font family's Arabic-script code points, as far as Arablyzer could read its files. */
export interface WebFontCoverageFact {
  /** As document.fonts names it. */
  readonly family: string
  /** Drawn by a face of the family that loaded. */
  readonly covered: readonly CodePointRange[]
  /**
   * Maybe drawn by a face of the family whose file Arablyzer could not read, or which had not
   * finished loading or failed: neither covered nor missing.
   */
  readonly unknown: readonly CodePointRange[]
}

/**
 * What a font file the page loaded turned out to be: its code points; null when it arrived but
 * could not be read (too large, of unknown size, or not a font Arablyzer reads). A file that was
 * never loaded, or failed, has no entry.
 */
export type FontFiles = ReadonlyMap<string, readonly CodePointRange[] | null>

const MAX_FAMILIES = 50

/**
 * Each web font family's Arabic coverage (docs/design/plans/m1.2c-css-fonts.md §2). The faces
 * are document.fonts', which lists every @font-face rule the page has, and their status; the
 * rules, read from the stylesheets Arablyzer could read, say which files each face loads. Faces
 * and rules pair up by family and unicode-range. A range is unknown when a face in it is still
 * loading or failed, or when fewer of its rules came to a file Arablyzer read or tried to read
 * than it has loaded faces (its stylesheet was not read, or a script added the face).
 */
export function webFontCoverage(
  faces: readonly FontFaceFact[],
  rules: readonly FontFaceRule[],
  files: FontFiles,
): WebFontCoverageFact[] {
  const families = new Map<string, { name: string; faces: FontFaceFact[] }>()
  for (const face of faces) {
    const key = face.family.toLowerCase()
    const family = families.get(key)
    if (family !== undefined) family.faces.push(face)
    else if (families.size < MAX_FAMILIES) families.set(key, { name: face.family, faces: [face] })
  }
  const result: WebFontCoverageFact[] = []
  for (const [key, family] of families) {
    const covered: CodePointRange[] = []
    const unknown: CodePointRange[] = []
    const groups = new Map<string, { range: readonly CodePointRange[]; faces: FontFaceFact[] }>()
    for (const face of family.faces) {
      const range = parseUnicodeRange(face.unicodeRange) ?? ALL_CODE_POINTS
      const id = JSON.stringify(range)
      const group = groups.get(id)
      if (group !== undefined) group.faces.push(face)
      else groups.set(id, { range, faces: [face] })
    }
    for (const [id, group] of groups) {
      // Only the Arabic blocks, and the riyal sign, are kept: a CJK font's coverage runs to thousands of ranges.
      const arabic = intersectRanges(group.range, KEPT_BLOCKS)
      const loaded = group.faces.filter((face) => face.status === 'loaded').length
      const pending = group.faces.some(
        (face) => face.status === 'loading' || face.status === 'error',
      )
      const outcomes = rules
        .filter(
          (rule) => rule.family.toLowerCase() === key && JSON.stringify(rule.unicodeRange) === id,
        )
        .map((rule) => ruleOutcome(rule, files))
      const read = outcomes.filter((outcome) => outcome !== 'not-loaded')
      if (pending || read.length < loaded || read.includes('unreadable')) unknown.push(...arabic)
      for (const outcome of read) {
        if (typeof outcome === 'object') covered.push(...intersectRanges(outcome, arabic))
      }
    }
    result.push({
      family: family.name,
      covered: mergeRanges(covered),
      unknown: mergeRanges(unknown),
    })
  }
  return result
}

/** What a rule's font came to: the first of its sources the browser loaded. */
function ruleOutcome(
  rule: FontFaceRule,
  files: FontFiles,
): readonly CodePointRange[] | 'unreadable' | 'not-loaded' {
  // One never loaded, or failed, is passed over, as the browser passes over it.
  for (const source of rule.sources) {
    const coverage = source.kind === 'data' ? source.coverage : files.get(source.url)
    if (coverage === undefined) continue
    return coverage ?? 'unreadable'
  }
  return 'not-loaded'
}

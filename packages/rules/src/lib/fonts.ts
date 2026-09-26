import type { FontFaceFact, RenderedFacts } from '@arablyzer/collectors'

/** The Arabic letters, U+0621 to U+064A: those a font must have to draw Arabic words. */
const ARABIC_LETTERS = { first: 0x0621, last: 0x064a } as const

/**
 * Whether a face's unicode-range includes Arabic letters. FontFace.unicodeRange lists `U+X`,
 * `U+X-Y` and `U+4??` wildcards, and is `U+0-10FFFF` when the @font-face rule sets none.
 */
export function coversArabic(unicodeRange: string): boolean {
  if (unicodeRange.trim() === '') return true
  for (const part of unicodeRange.split(',')) {
    const match = /^\s*u\+([0-9a-f?]{1,6})(?:-([0-9a-f]{1,6}))?\s*$/i.exec(part)
    const from = match?.[1]
    if (from === undefined) continue
    const start = Number.parseInt(from.replaceAll('?', '0'), 16)
    const end = from.includes('?')
      ? Number.parseInt(from.replaceAll('?', 'f'), 16)
      : Number.parseInt(match?.[2] ?? from, 16)
    if (start <= ARABIC_LETTERS.last && end >= ARABIC_LETTERS.first) return true
  }
  return false
}

/** The page's faces of a family; CSS family names match without regard to case. */
export function facesOf(facts: RenderedFacts, family: string): FontFaceFact[] {
  const name = family.toLowerCase()
  return facts.fontFaces.filter((face) => face.family.toLowerCase() === name)
}

/** The faces of a family that could draw Arabic letters. */
export function arabicFacesOf(facts: RenderedFacts, family: string): FontFaceFact[] {
  return facesOf(facts, family).filter((face) => coversArabic(face.unicodeRange))
}

/**
 * The family's Arabic faces failed to load: at least one ended in error and none loaded. A face
 * never asked for stays "unloaded", and one still loading proves nothing yet.
 */
export function failedForArabic(facts: RenderedFacts, family: string): boolean {
  const faces = arabicFacesOf(facts, family)
  return (
    faces.some((face) => face.status === 'error') && !faces.some((face) => face.status === 'loaded')
  )
}

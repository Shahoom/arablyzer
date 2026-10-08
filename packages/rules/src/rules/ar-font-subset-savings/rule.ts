import type { Engine, WebFontFileFact } from '@arablyzer/collectors'
import { renderedFacts } from '../../lib/rendered'
import { defineRule, type DetectorFinding } from '../../rule'

/** A subset must save more than half of the file and more than this to be worth a finding. */
export const MIN_SAVED_BYTES = 50 * 1024
export const MIN_SAVED_SHARE = 0.5

const kb = (bytes: number): string => `${Math.round(bytes / 1024)} KB`

/** The bytes a subset saves, when it would save enough to matter; null otherwise. */
export function saving(font: WebFontFileFact): number | null {
  if (font.subsetBytes === null) return null
  const saved = font.bytes - font.subsetBytes
  return saved > MIN_SAVED_BYTES && saved / font.bytes > MIN_SAVED_SHARE ? saved : null
}

/**
 * Arabic web fonts that carry far more than the page shows: a font file of the page's that draws
 * Arabic, whose subset (the characters the page's Arabic text uses, with the digits, punctuation,
 * joiners and the shaping tables Arabic needs) would be more than half smaller and more than 50 KB
 * smaller. The size of the subset is measured at render with HarfBuzz's subsetter; the finding
 * keeps the characters and the unicode-range so the tool's page can make the file.
 */
export const rule = defineRule({
  id: 'ar-font-subset-savings',
  version: '1.0.0',
  category: 'speed',
  severity: 'minor',
  needs: ['render', 'files'],
  messages: ['oversized'],
  appliesTo: (_page, evidence) =>
    renderedFacts(evidence).some((facts) =>
      facts.webFonts.some((font) => font.subsetBytes !== null),
    ),
  detect: ({ rendered = [] }) => {
    const seen = new Map<string, { font: WebFontFileFact; engines: Engine[] }>()
    for (const facts of rendered) {
      for (const font of facts.webFonts) {
        const known = seen.get(font.url)
        if (known === undefined) seen.set(font.url, { font, engines: [facts.engine] })
        else known.engines.push(facts.engine)
      }
    }
    return [...seen.values()].flatMap(({ font, engines }): DetectorFinding<'oversized'>[] => {
      const saved = saving(font)
      if (saved === null || font.subsetBytes === null) return []
      return [
        {
          message: 'oversized',
          values: {
            family: font.family,
            file: font.url.split(/[?#]/)[0]?.split('/').pop() ?? font.url,
            fontUrl: font.url,
            format: font.format,
            weight: font.weight ?? '',
            style: font.style ?? '',
            bytes: font.bytes,
            subsetBytes: font.subsetBytes,
            savedBytes: saved,
            size: kb(font.bytes),
            subset: kb(font.subsetBytes),
            saved: kb(saved),
            percent: Math.round((saved / font.bytes) * 100),
            characters: font.usedCharacters,
            unicodeRange: font.unicodeRange ?? '',
          },
          url: font.url,
          engines,
          key: font.url,
        },
      ]
    })
  },
})

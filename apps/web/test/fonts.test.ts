import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { fontFaces, fontsource } from '../src/fonts'

// The faces the site's two families offer (M2.6, the v2 type): DM Sans for Latin, IBM Plex Sans
// Arabic for Arabic, in one stack. The stack works because DM Sans's unicode-range holds no Arabic
// letter, so the browser skips it for them and draws them in Plex.
const DM_SANS = new URL('../node_modules/@fontsource/dm-sans/', import.meta.url)

/** Whether a unicode-range list (`U+0000-00FF,U+0131`) holds the code point. */
function holds(ranges: readonly string[], codePoint: number): boolean {
  return ranges.some((range) => {
    const [from = '', to = from] = range.replace(/^U\+/i, '').split('-')
    return codePoint >= parseInt(from, 16) && codePoint <= parseInt(to, 16)
  })
}

describe('fontFaces', () => {
  it('reads DM Sans’s faces: one for each subset, named family-subset-weight-style', () => {
    const faces = fontFaces(readFileSync(new URL('400.css', DM_SANS), 'utf8'), 'dm-sans')
    expect(faces.map((face) => [face.subset, face.weight, face.style, face.file])).toEqual([
      ['latin-ext', '400', 'normal', 'dm-sans-latin-ext-400-normal.woff2'],
      ['latin', '400', 'normal', 'dm-sans-latin-400-normal.woff2'],
    ])
  })
})

describe('fontsource', () => {
  const options = {
    familyName: 'DM Sans',
    weights: ['400', '500', '600', '700'],
    styles: ['normal'],
    subsets: ['latin'],
    formats: ['woff2'],
  }

  it('resolves DM Sans in the four weights the stack uses, from the installed files', async () => {
    const result = await fontsource().resolveFont(options as never)
    const fonts = result?.fonts ?? []
    expect(fonts.map((font) => String(font.weight))).toEqual(['400', '500', '600', '700'])
    for (const font of fonts) {
      expect(font.meta?.subset).toBe('latin')
      const source = font.src[0]
      const url = source !== undefined && 'url' in source ? source.url : ''
      expect(url.endsWith('.woff2'), url).toBe(true)
      expect(existsSync(url.startsWith('file:') ? fileURLToPath(url) : url), url).toBe(true)
    }
  })

  it('gives DM Sans a unicode-range with the Latin letters and not one Arabic letter', async () => {
    const result = await fontsource().resolveFont({ ...options, weights: ['400'] } as never)
    const [font] = result?.fonts ?? []
    const ranges = font?.unicodeRange ?? []
    expect(holds(ranges, 'A'.codePointAt(0) ?? 0)).toBe(true)
    expect(holds(ranges, '7'.codePointAt(0) ?? 0)).toBe(true)
    // U+0621 to U+064A, the Arabic letters; and the block's digits.
    for (let letter = 0x0621; letter <= 0x064a; letter++) {
      expect(holds(ranges, letter), letter.toString(16)).toBe(false)
    }
    expect(holds(ranges, 0x0660)).toBe(false)
  })
})

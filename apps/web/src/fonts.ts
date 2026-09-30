import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { FontProvider } from 'astro'

/**
 * Fonts from the Fontsource packages installed with the site, read from disk (M2.1 plan §0):
 * Astro's own `npm` provider sends the build to jsDelivr for the files, and its `local` provider
 * does not know each file's subset, which the preload links are chosen by. The faces are
 * Fontsource's, one per weight and subset, with its unicode ranges.
 *
 * `borrow` takes a subset from another family: IBM Plex Mono has no Arabic letters, so code that
 * quotes Arabic is drawn in IBM Plex Sans Arabic within the same family, by unicode range, and
 * never in whatever the system has (the report page, M2.1c review).
 */
export function fontsource(
  options: { readonly borrow?: Readonly<Record<string, string>> } = {},
): FontProvider {
  let root = new URL('../', import.meta.url)
  const borrowed = Object.entries(options.borrow ?? {})
  return {
    name: `fontsource-files${borrowed.map(([subset, family]) => `+${subset}:${family}`).join('')}`,
    init(context) {
      root = context.root
    },
    resolveFont({ familyName, weights, styles, subsets }) {
      const fonts = subsets.flatMap((subset) => {
        const from = options.borrow?.[subset] ?? familyName
        const slug = from.toLowerCase().replaceAll(' ', '-')
        const dir = new URL(`node_modules/@fontsource/${slug}/`, root)
        return weights.flatMap((weight) =>
          fontFaces(readFileSync(new URL(`${weight}.css`, dir), 'utf8'), slug)
            .filter((face) => face.subset === subset && styles.includes(face.style))
            .map((face) => ({
              src: [{ url: fileURLToPath(new URL(`files/${face.file}`, dir)), format: 'woff2' }],
              weight: face.weight,
              style: face.style,
              unicodeRange: face.unicodeRange,
              meta: { subset: face.subset },
            })),
        )
      })
      return { fonts }
    },
  }
}

export interface FontsourceFace {
  readonly subset: string
  readonly weight: string
  readonly style: 'normal' | 'italic'
  /** The woff2 file, in the package's files/ directory. */
  readonly file: string
  readonly unicodeRange: string[]
}

/** The @font-face rules of one of Fontsource's CSS files, for the family whose files they name. */
export function fontFaces(css: string, slug: string): FontsourceFace[] {
  const faces: FontsourceFace[] = []
  for (const [, body = ''] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const file = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(body)?.[1]
    const weight = /font-weight:\s*(\d+)/.exec(body)?.[1]
    const style = /font-style:\s*(normal|italic);/.exec(body)?.[1]
    const range = /unicode-range:\s*([^;]+);/.exec(body)?.[1]
    // Files are named <family>-<subset>-<weight>-<style>.woff2.
    const name = `${slug}-`
    const tail = `-${weight ?? ''}-${style ?? ''}.woff2`
    const subset =
      file?.startsWith(name) === true && file.endsWith(tail)
        ? file.slice(name.length, -tail.length)
        : ''
    if (
      file === undefined ||
      weight === undefined ||
      (style !== 'normal' && style !== 'italic') ||
      range === undefined ||
      subset === ''
    ) {
      throw new Error(`Not a Fontsource @font-face rule of ${slug}: ${body.trim().slice(0, 120)}`)
    }
    faces.push({
      subset,
      weight,
      style,
      file,
      unicodeRange: range.split(',').map((part) => part.trim()),
    })
  }
  return faces
}

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

// The site's own self-hosted fonts (the Fontsource packages the site is built with), embedded in
// the document as data: URLs. The browser that draws the PDF has no network and no system font to
// fall back on: every letter comes from these files, and they are embedded again, as subsets, in
// the PDF itself.

interface Face {
  readonly family: string
  readonly package: string
  /** Fontsource subsets to take. */
  readonly subsets: readonly string[]
  readonly weights: readonly number[]
}

const FACES: readonly Face[] = [
  {
    family: 'IBM Plex Sans Arabic',
    package: 'ibm-plex-sans-arabic',
    subsets: ['arabic', 'latin'],
    weights: [400, 600, 700],
  },
  { family: 'DM Sans', package: 'dm-sans', subsets: ['latin'], weights: [400, 600, 700] },
  { family: 'IBM Plex Mono', package: 'ibm-plex-mono', subsets: ['latin'], weights: [400] },
]

const require = createRequire(import.meta.url)
let cached: string | undefined

/** The `@font-face` rules of all three families, files inlined; read once. */
export function fontCss(): string {
  if (cached !== undefined) return cached
  const rules: string[] = []
  for (const face of FACES) {
    const root = path.dirname(require.resolve(`@fontsource/${face.package}/package.json`))
    for (const weight of face.weights) {
      const css = readFileSync(path.join(root, `${weight}.css`), 'utf8')
      for (const [, body = ''] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
        const file = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(body)?.[1]
        const range = /unicode-range:\s*([^;]+);/.exec(body)?.[1]
        const style = /font-style:\s*(normal|italic);/.exec(body)?.[1]
        if (file === undefined || style !== 'normal') continue
        const subset = face.subsets.find((name) =>
          file.includes(`-${name}-${String(weight)}-normal`),
        )
        if (subset === undefined) continue
        const data = readFileSync(path.join(root, 'files', file)).toString('base64')
        rules.push(
          `@font-face{font-family:'${face.family}';font-style:normal;font-weight:${String(weight)};font-display:block;` +
            `src:url(data:font/woff2;base64,${data}) format('woff2');` +
            `${range === undefined ? '' : `unicode-range:${range};`}}`,
        )
      }
    }
  }
  cached = rules.join('\n')
  return cached
}

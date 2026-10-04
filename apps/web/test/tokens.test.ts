import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The design tokens of src/styles/global.css (M2.6, the v2 system), read as the file declares
// them. The site is judged by its own rules, and the contrast rule is one: every pair of text on
// a ground that the system offers is checked here, so a token cannot drift under 4.5:1 unseen.
const CSS = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8')
const THEME = /@theme\s*\{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? ''

/** Every colour token as `name -> #rrggbb`. */
const TOKENS = new Map<string, string>(
  [...THEME.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(
    ([, name = '', hex = '']) => [name, hex.toLowerCase()],
  ),
)

function token(name: string): string {
  const hex = TOKENS.get(name)
  if (hex === undefined) throw new Error(`global.css declares no --color-${name}`)
  return hex
}

const channel = (value: number) => {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
/** WCAG 2.x relative luminance. */
function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16))
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}
function contrast(a: string, b: string): number {
  const [light = 0, dark = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/** [text, ground] pairs that need 4.5:1, by token name. */
const TEXT: readonly (readonly [string, string])[] = [
  ['ink', 'bg'],
  ['ink', 'surface'],
  ['ink', 'surface-2'],
  ['ink-2', 'bg'],
  ['ink-2', 'surface'],
  ['ink-2', 'surface-2'],
  ['ink-2', 'line'],
  // The quietest text sits on the ground and on white cards, and on the quiet fill, not on tints.
  ['ink-3', 'bg'],
  ['ink-3', 'surface'],
  ['ink-3', 'surface-2'],
  ['brand-ink', 'bg'],
  ['brand-ink', 'surface'],
  ['brand-ink', 'brand-soft'],
  ['brand', 'surface'],
  ['brand', 'bg'],
  ['white', 'brand'],
  ['white', 'brand-ink'],
  ['indigo', 'indigo-soft'],
  ['indigo-ink', 'indigo-soft'],
  ['blue', 'blue-soft'],
  ['blue', 'surface'],
  ['blue', 'bg'],
  ['violet', 'bg'],
  ['violet', 'surface'],
  // Severities: critical is a fill with white text on it; its text is critical-ink.
  ['white', 'critical'],
  ['critical-ink', 'critical-soft'],
  ['critical-ink', 'bg'],
  ['critical-ink', 'surface'],
  ['serious', 'serious-soft'],
  ['serious', 'bg'],
  ['serious', 'surface'],
  ['white', 'serious'],
  ['moderate', 'moderate-soft'],
  ['moderate', 'bg'],
  ['moderate', 'surface'],
  ['pass', 'pass-soft'],
  ['pass', 'bg'],
  ['pass', 'surface'],
  // The dark panel.
  ['panel-text', 'panel'],
  ['panel-soft', 'panel'],
  ['panel-dim', 'panel'],
  ['panel-signal', 'panel'],
  ['panel-pass', 'panel'],
  ['panel-measure', 'panel'],
  ['panel-moderate', 'panel'],
  ['white', 'panel'],
]

const CATEGORIES = [
  'render',
  'rtl',
  'fonts',
  'forms',
  'whatsapp',
  'prices',
  'index',
  'speed',
  'schema',
  'ai',
] as const

describe('the design tokens', () => {
  it('are read from the @theme block as hex values', () => {
    expect(TOKENS.size).toBeGreaterThan(60)
    expect(token('bg')).toBe('#f6f8fb')
    expect(token('brand')).toBe('#007d88')
  })

  it.each(TEXT)('keep %s above 4.5:1 on %s', (text, ground) => {
    expect(contrast(token(text), token(ground))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(CATEGORIES)(
    'keep the %s category readable on its tint, on white and on the ground',
    (name) => {
      const colour = token(`cat-${name}`)
      for (const ground of [token(`cat-${name}-soft`), token('surface'), token('bg')]) {
        expect(contrast(colour, ground), `${name} on ${ground}`).toBeGreaterThanOrEqual(4.5)
      }
    },
  )

  it('keep an input’s border, the focus rings and the panel’s ring at 3:1 against their grounds', () => {
    for (const ground of ['surface', 'bg']) {
      expect(contrast(token('field'), token(ground)), `field on ${ground}`).toBeGreaterThanOrEqual(
        3,
      )
      expect(
        contrast(token('indigo'), token(ground)),
        `indigo on ${ground}`,
      ).toBeGreaterThanOrEqual(3)
    }
    expect(contrast(token('panel-measure'), token('panel'))).toBeGreaterThanOrEqual(3)
  })

  it('keep the gradient of the headline phrase above 4.5:1 at every stop, on both grounds', () => {
    const stops = /--gradient-text:\s*linear-gradient\(([^;]*)\);/.exec(THEME)?.[1] ?? ''
    const colours = [...stops.matchAll(/#[0-9a-f]{6}/gi)].map(([hex]) => hex.toLowerCase())
    expect(colours.length).toBe(3)
    for (const colour of colours) {
      for (const ground of ['surface', 'bg']) {
        expect(contrast(colour, token(ground)), `${colour} on ${ground}`).toBeGreaterThanOrEqual(
          4.5,
        )
      }
    }
  })

  it('keep white text above 4.5:1 on both ends of the button gradient', () => {
    const stops = /--gradient-btn:\s*linear-gradient\(([^;]*)\);/.exec(THEME)?.[1] ?? ''
    const colours = [...stops.matchAll(/#[0-9a-f]{6}/gi)].map(([hex]) => hex.toLowerCase())
    expect(colours.length).toBe(2)
    for (const colour of colours) {
      expect(contrast('#ffffff', colour), colour).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('give the dark panel the navy of the dark band', () => {
    expect(token('panel')).toBe(token('navy'))
  })

  it('leave the colours the Open Graph cards read as literal hex values', () => {
    // scripts/og-card.ts reads these by name from the file, not from the compiled CSS.
    for (const name of [
      'bg',
      'ink',
      'ink-2',
      'ink-3',
      'line-2',
      'brand-ink',
      'indigo-soft',
      'indigo-ink',
    ]) {
      expect(TOKENS.has(name), name).toBe(true)
    }
  })

  it('have no colour of the Lab system left, nor an alias for one (R6 removed them)', () => {
    for (const gone of [
      'signal',
      'signal-soft',
      'paper',
      'sheet',
      'ink-4',
      'rule',
      'rule-strong',
      'rule-soft',
      'tick',
      'moderate-line',
      'measure',
      'measure-soft',
    ]) {
      expect(TOKENS.has(gone), gone).toBe(false)
    }
    for (const gone of ['bg-lab-grid', 'shadow-key', 'bg-ruler', 'mark-signal', 'bg-panel-grid']) {
      expect(CSS, gone).not.toContain(`@utility ${gone}`)
    }
  })
})

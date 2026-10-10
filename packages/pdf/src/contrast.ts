/** Arablyzer's own colour: white text on it passes 4.5:1 with room (the site's indigo-ink). */
export const DEFAULT_BRAND_COLOR = '#3730a3'
const WHITE = '#ffffff'
/** WCAG 2.1 AA for normal text. */
export const MIN_TEXT_CONTRAST = 4.5

const channel = (value: number): number => {
  const unit = value / 255
  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
}

/** The relative luminance of `#rrggbb` (WCAG 2.1). */
export function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16)
  return (
    0.2126 * channel((value >> 16) & 255) +
    0.7152 * channel((value >> 8) & 255) +
    0.0722 * channel(value & 255)
  )
}

/** The contrast ratio of two `#rrggbb` colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

export const isHexColor = (value: string): boolean => /^#[0-9a-fA-F]{6}$/.test(value)

/**
 * The colour a brand's bands and marks are drawn in, with white text on them: the account's colour
 * when white text on it reaches 4.5:1, and Arablyzer's own when it does not (or when none is set).
 * `fallback` tells that the account's colour was set and not used.
 */
export function brandColorOf(chosen: string | null): { color: string; fallback: boolean } {
  if (chosen === null || !isHexColor(chosen)) return { color: DEFAULT_BRAND_COLOR, fallback: false }
  const color = chosen.toLowerCase()
  return contrastRatio(color, WHITE) >= MIN_TEXT_CONTRAST
    ? { color, fallback: false }
    : { color: DEFAULT_BRAND_COLOR, fallback: true }
}

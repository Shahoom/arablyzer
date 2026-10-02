import { HERO_TOOLS, type HeroTool } from '@arablyzer/i18n'
import { Engine, type Category } from '@arablyzer/report-schema'
import { GUIDES_DATA } from './guide-data'
import { LIBRARY_DATA } from './rule-data'
import { TOOLS_DATA } from './tool-data'

// What the home page counts and links to, in one place: the numbers are read from the registries
// the site is built from, so a tool, a rule or a guide added tomorrow changes the page with no
// edit here (M2.6 R2: no number on the page is typed in), and the tools it names are by slug, so
// a tool that is renamed or gone breaks the build and a test, not a link.

/** The numbers of the strip under the marquee, and the ones in the hero and the plans. */
export interface HomeCounts {
  readonly tools: number
  /** Every rule a scan runs. */
  readonly rules: number
  /** The browsers a page is opened in. */
  readonly engines: number
  /** The /fix guides, one for each Search Console message. */
  readonly guides: number
  readonly terms: number
}

export function homeCounts(): HomeCounts {
  return {
    tools: TOOLS_DATA.tools.length,
    rules: LIBRARY_DATA.rules.length,
    engines: Engine.options.length,
    guides: GUIDES_DATA.fix.length,
    terms: GUIDES_DATA.glossary.length,
  }
}

/** The chips under the scan box: a link to each of these tools (the copy names each). */
export const HERO_TOOL_SLUGS: readonly HeroTool[] = HERO_TOOLS

/**
 * The tools the marquee names, as its caption says "from our tools": those of the Arabic layer
 * first, then the rest of the families, one or two of each. Their names are the registry's.
 */
export const MARQUEE_TOOL_SLUGS = [
  'rtl-check',
  'arabic-shaping-check',
  'arabic-font-check',
  'arabic-form-test',
  'whatsapp-link-generator',
  'robots-check',
  'sitemap-check',
  'hreflang-check',
  'security-headers',
  'tls-check',
  'payment-methods-detector',
  'price-format-check',
  'ai-crawler-check',
  'core-web-vitals',
  'mirrored-icons-check',
  'digits-consistency',
] as const

/** Each bento tile's tool: the page its tile links to. */
export const BENTO_TOOLS = {
  engines: 'arabic-shaping-check',
  forms: 'arabic-form-test',
  whatsapp: 'whatsapp-link-check',
  ai: 'ai-crawler-check',
  speed: 'core-web-vitals',
  trust: 'tls-check',
  robots: 'robots-check',
} as const

/** The categories of the example report the product shot lists, in its order. */
export const SHOWN_CATEGORIES = [
  'rtl',
  'ar-render',
  'ar-content',
  'index',
] as const satisfies readonly Category[]

/** How a category's score is drawn: whole and sound, partly lost, or lost. */
export type ScoreTone = 'good' | 'mid' | 'low'

export function scoreTone(score: number): ScoreTone {
  return score >= 90 ? 'good' : score >= 50 ? 'mid' : 'low'
}

/** A ring's dash for a score: `pathLength` is 100, so the arc is the score itself. */
export function ringDash(score: number): string {
  const clamped = Math.min(100, Math.max(0, score))
  return `${clamped} 100`
}

/** A bar's x and width, in percent of its track, for a score, from the side the page starts on. */
export function barSpan(score: number, rtl: boolean): { x: number; width: number } {
  // A score of 0 is a sliver, not an empty bar: it is a result, not a missing one.
  const width = Math.min(100, Math.max(score, 2))
  return { x: rtl ? 100 - width : 0, width }
}

/**
 * Core Web Vitals' thresholds for a phone's 75th percentile (web.dev/articles/vitals): up to
 * `good` it is good, up to `poor` it needs improvement, and beyond it is poor. The gauges' arcs
 * run to `scale`, so a value fills its share of the arc.
 */
export const VITALS = {
  lcp: { value: 2.1, good: 2.5, poor: 4, scale: 4, unit: 'seconds' },
  inp: { value: 180, good: 200, poor: 500, scale: 500, unit: 'milliseconds' },
  cls: { value: 0.24, good: 0.1, poor: 0.25, scale: 0.5, unit: null },
} as const

export type Vital = keyof typeof VITALS

/** The gauge of one vital: how much of its arc is filled, and whether the value is good. */
export function gauge(vital: Vital): { fill: number; tone: 'good' | 'mid' | 'poor' } {
  const { value, good, poor, scale } = VITALS[vital]
  return {
    fill: Math.round(Math.min(1, value / scale) * 1000) / 10,
    tone: value <= good ? 'good' : value <= poor ? 'mid' : 'poor',
  }
}

/**
 * The daily score of the monitoring preview, oldest first: made up, like the rest of the preview
 * (the page says so). Each is a height in the preview's 640 by 200 chart, lower for a higher score.
 */
export const PREVIEW_SERIES = [
  128, 128, 116, 116, 116, 104, 92, 92, 86, 74, 44, 68, 68, 56,
] as const

/** The points of the preview's line, newest at the start of the line in either direction. */
export function previewPoints(rtl: boolean): { x: number; y: number }[] {
  const last = PREVIEW_SERIES.length - 1
  return PREVIEW_SERIES.map((y, index) => {
    const along = Math.round((index / last) * 640)
    return { x: rtl ? 640 - along : along, y }
  })
}

/**
 * Names in a sentence: «Chromium وFirefox وWebKit», «Chromium, Firefox and WebKit». Arabic
 * writes its "and" joined to the word after it.
 */
export function joinNames(names: readonly string[], lang: 'ar' | 'en'): string {
  if (lang === 'ar') return names.map((name, index) => (index === 0 ? name : `و${name}`)).join(' ')
  const last = names.at(-1)
  if (last === undefined || names.length === 1) return last ?? ''
  return `${names.slice(0, -1).join(', ')} and ${last}`
}

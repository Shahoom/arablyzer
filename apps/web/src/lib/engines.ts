import type { Engine } from '@arablyzer/report-schema'

// The three browsers a scan opens a page in, as the home page names and colours them. Kept apart
// from lib/showcase.ts, which reads the golden reports, so that the scan form's island can use
// them without bringing a report into the page's script.

export const ENGINE_NAMES: Readonly<Record<Engine, string>> = {
  chromium: 'Chromium',
  firefox: 'Firefox',
  webkit: 'WebKit',
}

/** Each engine's dot, in whole class names for Tailwind to find: blue, orange, sky (global.css tokens). */
export const ENGINE_DOT: Readonly<Record<Engine, string>> = {
  chromium: 'bg-engine-chromium',
  firefox: 'bg-engine-firefox',
  webkit: 'bg-engine-webkit',
}

/** In the order a page lists them. */
export const ENGINE_ORDER: readonly Engine[] = ['chromium', 'firefox', 'webkit']

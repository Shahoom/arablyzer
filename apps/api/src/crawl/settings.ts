// The crawl's settings from the environment (M4.5). The page cap is a plan number (packages/plans);
// these are the operator's: how politely, and how much is opened in browsers.

export interface CrawlSettings {
  /** The pause between two pages of one crawl, in ms. */
  readonly delayMs: number
  /** Pages scanned in the browsers for each template. */
  readonly representatives: number
  /** The templates that get any. */
  readonly renderedTemplates: number
}

export const DEFAULT_CRAWL_SETTINGS: CrawlSettings = Object.freeze({
  delayMs: 1_000,
  representatives: 1,
  renderedTemplates: 10,
})

/** The shortest pause a crawl may be set to: below it a crawl is a load test. */
export const MIN_DELAY_MS = 250
export const MAX_DELAY_MS = 30_000

function whole(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name]?.trim() ?? ''
  if (raw === '') return fallback
  const value = Number(raw)
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(
      `${name} must be a whole number from ${String(min)} to ${String(max)}, not ${raw}`,
    )
  }
  return value
}

/** Read when set; the defaults when not, in production too. A number out of range refuses to start. */
export function crawlSettingsFrom(
  env: Readonly<Record<string, string | undefined>>,
): CrawlSettings {
  return {
    delayMs: whole(
      env,
      'ARABLYZER_CRAWL_DELAY_MS',
      DEFAULT_CRAWL_SETTINGS.delayMs,
      MIN_DELAY_MS,
      MAX_DELAY_MS,
    ),
    representatives: whole(
      env,
      'ARABLYZER_CRAWL_REPRESENTATIVES',
      DEFAULT_CRAWL_SETTINGS.representatives,
      1,
      5,
    ),
    renderedTemplates: whole(
      env,
      'ARABLYZER_CRAWL_RENDERED_TEMPLATES',
      DEFAULT_CRAWL_SETTINGS.renderedTemplates,
      1,
      50,
    ),
  }
}

import manifest from 'playwright-core/package.json' with { type: 'json' }

/** The Playwright this package drives; installed browsers must match it. */
export const PLAYWRIGHT_VERSION: string = manifest.version

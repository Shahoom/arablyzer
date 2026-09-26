import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Browser tests render real pages, within the scan's own budget.
    testTimeout: 90_000,
    fileParallelism: false,
    env: { PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK: '1' },
  },
})

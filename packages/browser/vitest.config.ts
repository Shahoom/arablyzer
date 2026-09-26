import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // A render is bounded by its own budget (30 s); tests allow for that and a little more.
    testTimeout: 90_000,
    hookTimeout: 60_000,
    // One browser at a time, as in production (BUILD-PLAN §18.3.1).
    fileParallelism: false,
    env: {
      // Playwright adds <-loopback> for Chromium unless this is set; the SSRF suite must show
      // that Arablyzer's own launch settings keep loopback on the proxy.
      PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK: '1',
    },
  },
})

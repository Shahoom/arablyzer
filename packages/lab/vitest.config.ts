import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // A Lighthouse run is bounded by its own cap (60 s); tests allow for that and a little more.
    testTimeout: 120_000,
    hookTimeout: 60_000,
    // One browser at a time, as in production (BUILD-PLAN §18.3.1).
    fileParallelism: false,
  },
})

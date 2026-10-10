import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The browser test renders a real PDF in Chromium, within the renderer's own budget.
    testTimeout: 90_000,
    fileParallelism: false,
  },
})

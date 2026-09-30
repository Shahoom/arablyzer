import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Browser runs spawn the built CLI, which renders real pages within its own budget.
    testTimeout: 90_000,
    fileParallelism: false,
  },
})

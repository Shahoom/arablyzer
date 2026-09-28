import { defineConfig } from 'vitest/config'

// Each test reaches into the stack's containers (docker compose exec), a second or so a call.
export default defineConfig({ test: { testTimeout: 120_000, hookTimeout: 120_000 } })

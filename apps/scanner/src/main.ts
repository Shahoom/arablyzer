import { serve } from '@hono/node-server'
import { createScannerApp } from './app'
import { localScanner } from './local'
import { scanOptionsFrom } from './options'

// The scanner as Compose runs it (M2.1 plan §5b): the engine and its browsers, in a container
// whose one way out is the egress proxy, answering the worker alone. Production's checks hold
// whatever NODE_ENV says: ARABLYZER_ALLOW_PRIVATE is refused here.
const env: Readonly<Record<string, string | undefined>> = { ...process.env, NODE_ENV: 'production' }

/** The worker's token: long enough that it cannot be guessed. */
const MIN_TOKEN_LENGTH = 32
const token = env.ARABLYZER_SCANNER_TOKEN?.trim() ?? ''
if (token.length < MIN_TOKEN_LENGTH) {
  throw new Error(`ARABLYZER_SCANNER_TOKEN must be set, ${MIN_TOKEN_LENGTH} characters or more`)
}
const options = scanOptionsFrom(env)
if (options.policy?.upstream === undefined) {
  throw new Error(
    'ARABLYZER_EGRESS_PROXY must be set: the scanner reaches the web through it alone',
  )
}
const app = createScannerApp({
  token,
  scanner: localScanner(options),
  log: (text) => {
    console.error(text)
  },
  // A scan that will not stop: out, and Compose starts the scanner again (restart policy).
  onStuck: () => {
    process.exit(1)
  },
})
const server = serve(
  { fetch: app.fetch, port: Number(env.PORT ?? 8788), hostname: '0.0.0.0' },
  (info) => {
    console.log(`Scanner on port ${info.port}`)
  },
)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    // The scan running finishes first (Compose's stop_grace_period outlasts its budget).
    server.close()
  })
}

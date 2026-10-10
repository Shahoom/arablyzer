import { serve } from '@hono/node-server'
import { checkDenyCidrs } from '@arablyzer/egress'
import { createScannerApp } from './app'
import { assertIsolated } from './isolation'
import { localCrawler, localPdf, localScanner } from './local'
import { scanOptionsFrom } from './options'
import { retireAfterAnswer } from './retire'

// The scanner as Compose runs it (M2.1 plan §5b): the engine and its browsers, in a container
// whose one way out is the egress proxy, answering the worker alone. Production's checks hold
// whatever NODE_ENV says: ARABLYZER_ALLOW_PRIVATE is refused here. It ends its process after a scan
// that started a browser or Lighthouse (M3 of the pre-launch review): a browser here runs without a
// sandbox of its own, in the process that holds the token and the CrUX key, and Compose starts a
// clean one for the next scan. A scan that started none leaves the process as it is.
const env: Readonly<Record<string, string | undefined>> = { ...process.env, NODE_ENV: 'production' }

/** The worker's token: long enough that it cannot be guessed. */
const MIN_TOKEN_LENGTH = 32
const token = env.ARABLYZER_SCANNER_TOKEN?.trim() ?? ''
if (token.length < MIN_TOKEN_LENGTH) {
  throw new Error(`ARABLYZER_SCANNER_TOKEN must be set, ${MIN_TOKEN_LENGTH} characters or more`)
}
// The server's own public address, IPv4 and IPv6, which the scanner cannot see itself (BUILD-PLAN
// §18.3.1): it starts only with it named, and says what the list leaves open.
for (const warning of checkDenyCidrs(env.ARABLYZER_DENY_CIDRS).warnings) console.error(warning)
// WebKit runs only where the network reaches the egress proxy alone, which Compose says
// (ARABLYZER_NETWORK_ISOLATED); the container is asked, and refuses to start if it is not so.
await assertIsolated(env)
const options = scanOptionsFrom(env)
if (options.policy?.upstream === undefined) {
  throw new Error(
    'ARABLYZER_EGRESS_PROXY must be set: the scanner reaches the web through it alone',
  )
}
const app = createScannerApp({
  token,
  scanner: localScanner(options),
  crawler: localCrawler(options),
  pdf: localPdf(),
  log: (text) => {
    console.error(text)
  },
  // A scan that will not stop: out, and Compose starts the scanner again (restart policy).
  onStuck: () => {
    process.exit(1)
  },
  // A browser ran: the answer leaves, and the process ends, for Compose to start it again.
  onBrowserUsed: () => {
    console.error('A browser ran in this scan: the scanner ends its process, for a clean one')
    retireAfterAnswer(server, {
      exit: (code) => {
        process.exit(code)
      },
    })
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

import { writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { describePlan, formatResult, runLoad, type LoadOptions } from './load'
import { chooseTarget, inCi, wholeNumber } from './measure'

// The load test: what visitors send to a stack that is running on this machine, timed
// (infra/load/README.md, docs/deploy/staging.md).
//
//   pnpm load:stack                                    # the stack on 127.0.0.1:8080, compose.e2e.yaml's
//   pnpm load:stack --target http://127.0.0.1:18080 --scan-url http://93.184.216.50/
//
// It never runs in CI unless it is told to, and never sends anything to an address that is not
// loopback unless --target names it.

const DEFAULT_TARGET = 'http://127.0.0.1:8080'
/** The host Cloudflare's test keys answer with, which compose.e2e.yaml's stack is made for. */
const DEFAULT_ORIGIN = 'https://example.com'
/** Golden site 04, on the e2e stack's test network (compose.e2e.yaml). */
const DEFAULT_SCAN_URL = 'http://93.184.215.50/'
const DEFAULT_TOOL = 'rtl-check'

const HELP = `Usage: pnpm load:stack [options]

Sends a stack that runs on this machine, and was started with compose.e2e.yaml, what visitors
send it, and prints p50, p95 and the largest of each answer's time, and the errors.

  --target URL       the stack's site server (default ${DEFAULT_TARGET}, or ARABLYZER_STACK_URL)
                     Anything but loopback is refused unless this flag names it.
  --origin URL       the Origin of a scan request: the stack's ARABLYZER_SITE
                     (default ${DEFAULT_ORIGIN}, or ARABLYZER_STACK_ORIGIN)
  --scan-url URL     the page the scans ask for (default ${DEFAULT_SCAN_URL}, golden site 04)
  --tool SLUG        the tool page fetched, and the tool the tool scans run (default ${DEFAULT_TOOL})
  --pages N          requests for each of the home page and the tool page (default 300)
  --refusals N       requests for each kind of refusal: another origin, an internal host name (default 100)
  --visitors N       visitors that each start one tool scan and watch it to its end (default 6)
  --reads N          requests for each read of a finished scan (default 200)
  --burst N          scans that one visitor asks for at once, past its limits (default 10)
  --full N           whole scans, in three browsers, one after another (default 0)
  --concurrency N    requests in flight at once for pages, refusals and reads (default 8)
  --keep             leave the scans the run made (each is deleted with its own token otherwise)
  --json FILE        write the numbers to a file
  --dry-run          say what would be sent, and send nothing
  --allow-ci         run where CI is set: it is refused there otherwise

Exit code: 0 when there was no error and the limits refused the visitor that asked for too much;
1 when there was an error, or they did not; 2 for a request that was not understood or refused.`

function refuse(message: string): never {
  console.error(`load: ${message}`)
  process.exit(2)
}

const { values } = (() => {
  try {
    // `pnpm load:stack -- --pages 10` hands the script its own `--` first.
    const args = process.argv.slice(2)
    return parseArgs({
      args: args[0] === '--' ? args.slice(1) : args,
      options: {
        target: { type: 'string' },
        origin: { type: 'string' },
        'scan-url': { type: 'string' },
        tool: { type: 'string' },
        pages: { type: 'string' },
        refusals: { type: 'string' },
        visitors: { type: 'string' },
        reads: { type: 'string' },
        burst: { type: 'string' },
        full: { type: 'string' },
        concurrency: { type: 'string' },
        keep: { type: 'boolean' },
        json: { type: 'string' },
        'dry-run': { type: 'boolean' },
        'allow-ci': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    })
  } catch (error) {
    return refuse(`${error instanceof Error ? error.message : String(error)} (--help lists them)`)
  }
})()

if (values.help === true) {
  console.log(HELP)
  process.exit(0)
}
if (inCi(process.env) && values['allow-ci'] !== true) {
  refuse(
    'it does not run in CI: it sends bursts of requests to a stack. --allow-ci runs it anyway.',
  )
}

const chosen = chooseTarget(values.target, process.env.ARABLYZER_STACK_URL, DEFAULT_TARGET)
if (!chosen.ok) refuse(chosen.reason)

let options: LoadOptions
try {
  const scanUrl = new URL(values['scan-url'] ?? DEFAULT_SCAN_URL)
  if (scanUrl.protocol !== 'http:' && scanUrl.protocol !== 'https:') {
    throw new Error('--scan-url is an http or https address')
  }
  const tool = values.tool ?? DEFAULT_TOOL
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tool))
    throw new Error(`--tool is a tool's slug, not ${tool}`)
  options = {
    target: chosen.url,
    origin: new URL(values.origin ?? process.env.ARABLYZER_STACK_ORIGIN ?? DEFAULT_ORIGIN).origin,
    scanUrl: scanUrl.href,
    tool,
    pages: wholeNumber('pages', values.pages, 300),
    refusals: wholeNumber('refusals', values.refusals, 100),
    visitors: wholeNumber('visitors', values.visitors, 6),
    reads: wholeNumber('reads', values.reads, 200),
    burst: wholeNumber('burst', values.burst, 10),
    full: wholeNumber('full', values.full, 0),
    concurrency: wholeNumber('concurrency', values.concurrency, 8, 1),
    keep: values.keep === true,
  }
} catch (error) {
  refuse(error instanceof Error ? error.message : String(error))
}

for (const line of describePlan(options)) console.log(line)
if (chosen.remote) {
  console.log(
    `  NOTE: ${options.target.host} is not on this machine. Load only a stack that is yours to load.`,
  )
}
if (values['dry-run'] === true) process.exit(0)
console.log()

const result = await runLoad(options, {
  fetch,
  clock: () => performance.now(),
  say: (line) => {
    console.log(`> ${line}`)
  },
})
console.log()
for (const line of formatResult(result)) console.log(line)

if (values.json !== undefined) {
  const { target, ...rest } = options
  await writeFile(
    values.json,
    `${JSON.stringify({ at: new Date().toISOString(), node: process.version, target: target.origin, options: rest, result }, null, 2)}\n`,
  )
}
// Not process.exit(): the table is written before this process ends, whatever its stdout is.
process.exitCode = result.ok ? 0 : 1

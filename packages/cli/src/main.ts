import { run } from './cli'

const controller = new AbortController()
process.once('SIGINT', () => {
  controller.abort()
})

try {
  process.exitCode = await run(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    env: process.env,
    color: process.stdout.isTTY && process.env.NO_COLOR === undefined,
    signal: controller.signal,
  })
} catch (error) {
  // Exit code 1 means "rules failed", so an internal error must not use it.
  process.stderr.write(
    `arablyzer: unexpected error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  )
  process.exitCode = 2
}

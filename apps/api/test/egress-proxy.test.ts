import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { startConnectProbe, type ConnectProbe } from '@arablyzer/fixtures'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const run = promisify(execFile)
const script = fileURLToPath(new URL('./support/google-callback.ts', import.meta.url))

// Every request the API makes leaves through the egress proxy (M2.1 plan §5b). Turnstile's and
// Search Console's go through `safeFetch`; Better Auth's calls to Google use the global `fetch`,
// which reaches the proxy through Node's own: NODE_USE_ENV_PROXY=1 with HTTPS_PROXY. This runs
// that library with the real `fetch` in a child process and watches who asks the "proxy".
describe("the library's own requests to Google", () => {
  let probe: ConnectProbe
  beforeAll(async () => {
    probe = await startConnectProbe()
  })
  afterAll(async () => {
    await probe.close()
  })

  it('go through the egress proxy, and a refused one is a sign-in that failed, not a session', async () => {
    const { stdout } = await run(process.execPath, ['--import', 'tsx', script], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: {
        PATH: process.env.PATH ?? '',
        NODE_USE_ENV_PROXY: '1',
        HTTPS_PROXY: `http://127.0.0.1:${String(probe.port)}`,
        NO_PROXY: '127.0.0.1,localhost',
      },
      timeout: 60_000,
    })
    const answer = JSON.parse(stdout.trim().split('\n').pop() ?? '{}') as {
      status: number
      location: string | null
      session: boolean
    }
    expect(probe.seen).toContain('CONNECT oauth2.googleapis.com:443')
    expect(answer.status).toBe(302)
    expect(answer.location).toContain('/login')
    expect(answer.session).toBe(false)
  }, 70_000)
})

import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { startServer } from '../helpers'

// Security review 2026-09-24: safeFetch uses a fresh agent (agent: false), so proxy settings from
// the environment never apply. A proxy would resolve names itself and skip the pinned lookup.
it('ignores proxy settings from the environment', async () => {
  const proxyHits: string[] = []
  const proxy = await startServer((req, res) => {
    proxyHits.push(req.url ?? '')
    res.end('via proxy')
  })
  const target = await startServer((_req, res) => {
    res.end('direct')
  })
  try {
    const child = fileURLToPath(new URL('../env-proxy-child.mts', import.meta.url))
    const output = await new Promise<string>((resolve, reject) => {
      execFile(
        process.execPath,
        ['--import', 'tsx', child, String(target.port)],
        {
          env: {
            ...process.env,
            NODE_USE_ENV_PROXY: '1',
            HTTP_PROXY: proxy.origin,
            http_proxy: proxy.origin,
            NO_PROXY: '',
            no_proxy: '',
          },
        },
        (error, stdout) => {
          if (error) reject(new Error(`child process failed: ${error.message}`, { cause: error }))
          else resolve(stdout)
        },
      )
    })
    // The control request proves the proxy settings were active in the child.
    expect(JSON.parse(output)).toEqual({ safeFetch: 'direct', control: 'via proxy' })
    expect(proxyHits).toHaveLength(1)
  } finally {
    await Promise.all([proxy.close(), target.close()])
  }
})

// Child process for test/ssrf/env-proxy.test.ts: runs with NODE_USE_ENV_PROXY=1 and HTTP_PROXY set.
import http from 'node:http'
import { safeFetch } from '../src/fetch'
import { createPolicy } from '../src/policy'

const port = Number(process.argv[2])
const target = `http://127.0.0.1:${port}/`

const viaSafeFetch = await safeFetch(target, {
  userAgent: 'env-proxy-test',
  policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port }] }),
})

// Control: a plain request through Node's global agent, which does honour the proxy settings.
const control = await new Promise<string>((resolve, reject) => {
  http
    .get(target, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => (body += chunk))
      res.on('end', () => {
        resolve(body)
      })
    })
    .on('error', reject)
})

process.stdout.write(
  JSON.stringify({
    safeFetch: Buffer.from(viaSafeFetch.response?.body ?? new Uint8Array()).toString('utf8'),
    control,
  }),
)

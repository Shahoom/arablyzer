import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import https from 'node:https'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { safeFetch } from '../../src/fetch'
import { onlyServer, UA } from '../helpers'

let server: https.Server
let port = 0
let dir = ''

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'arablyzer-tls-'))
  const key = path.join(dir, 'key.pem')
  const cert = path.join(dir, 'cert.pem')
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
    ].concat(['-keyout', key, '-out', cert]),
    { stdio: 'ignore' },
  )
  server = https.createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (_req, res) => {
    res.end('should not be read')
  })
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  port = typeof address === 'object' && address !== null ? address.port : 0
})

afterAll(() => {
  server.close()
  rmSync(dir, { recursive: true, force: true })
})

it('refuses certificates that do not verify', async () => {
  const result = await safeFetch(`https://127.0.0.1:${port}/`, {
    userAgent: UA,
    policy: onlyServer(port),
  })
  expect(result.response).toBeNull()
  expect(result.error?.code).toBe('tls-failed')
})

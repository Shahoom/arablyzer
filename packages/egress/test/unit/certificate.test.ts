import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import https from 'node:https'
import { tmpdir } from 'node:os'
import path from 'node:path'
import tls from 'node:tls'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { safeFetch, validityOf } from '../../src/fetch'
import { onlyServer, UA } from '../helpers'

let server: https.Server
let port = 0
let dir = ''
const trusted = tls.getCACertificates('default')

// A CA of this test's own, trusted in this process only, signs a certificate for 127.0.0.1.
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'arablyzer-cert-'))
  const file = (name: string) => path.join(dir, name)
  const openssl = (...args: string[]) => execFileSync('openssl', args, { stdio: 'ignore' })
  openssl(
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '2',
    '-subj',
    '/CN=Arablyzer Test CA',
    '-keyout',
    file('ca.key'),
    '-out',
    file('ca.pem'),
  )
  openssl(
    'req',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-subj',
    '/CN=127.0.0.1',
    '-keyout',
    file('leaf.key'),
    '-out',
    file('leaf.csr'),
  )
  writeFileSync(file('ext.cnf'), 'subjectAltName=IP:127.0.0.1\n')
  openssl(
    'x509',
    '-req',
    '-in',
    file('leaf.csr'),
    '-CA',
    file('ca.pem'),
    '-CAkey',
    file('ca.key'),
    '-CAcreateserial',
    '-days',
    '30',
    '-extfile',
    file('ext.cnf'),
    '-out',
    file('leaf.pem'),
  )
  tls.setDefaultCACertificates([...trusted, readFileSync(file('ca.pem'), 'utf8')])
  server = https.createServer(
    { key: readFileSync(file('leaf.key')), cert: readFileSync(file('leaf.pem')) },
    (_req, res) => {
      res.end('secure')
    },
  )
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  port = typeof address === 'object' && address !== null ? address.port : 0
})

afterAll(() => {
  tls.setDefaultCACertificates(trusted)
  server.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('the certificate of a verified HTTPS response', () => {
  it('gives when it became valid and when it expires', async () => {
    const started = Date.now()
    const result = await safeFetch(`https://127.0.0.1:${port}/`, {
      userAgent: UA,
      policy: onlyServer(port),
    })
    expect(result.error).toBeNull()
    const certificate = result.response?.certificate
    expect(certificate).not.toBeNull()
    const from = Date.parse(certificate?.validFrom ?? '')
    const to = Date.parse(certificate?.validTo ?? '')
    // openssl's -days 30 from now, to the second.
    expect(Math.abs(from - started)).toBeLessThan(120_000)
    expect(Math.abs(to - from - 30 * 86_400_000)).toBeLessThan(120_000)
  })

  it('gives none for dates that do not parse', () => {
    const socket = { getPeerCertificate: () => ({ valid_from: 'soon', valid_to: '' }) }
    expect(validityOf(socket as unknown as tls.TLSSocket)).toBeNull()
  })
})

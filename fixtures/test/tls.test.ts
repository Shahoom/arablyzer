import https from 'node:https'
import type { AddressInfo } from 'node:net'
import tls from 'node:tls'
import { afterAll, describe, expect, it } from 'vitest'
import { certificateWindow, serverCertificate, trustFixtureCa } from '../src/tls'

const servers: https.Server[] = []
const trusted = tls.getCACertificates('default')

afterAll(() => {
  tls.setDefaultCACertificates(trusted)
  for (const server of servers) server.close()
})

async function serve(hosts: readonly string[], lifetimeDays: number, daysLeft: number) {
  const [notBefore, notAfter] = certificateWindow(lifetimeDays, daysLeft)
  const server = https.createServer(serverCertificate(hosts, notBefore, notAfter), (_req, res) => {
    res.end('ok')
  })
  servers.push(server)
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  return (server.address() as AddressInfo).port
}

function get(port: number, servername?: string) {
  return new Promise<{ body: string; validFrom: string; validTo: string }>((resolve, reject) => {
    const request = https.get(
      {
        host: '127.0.0.1',
        port,
        path: '/',
        agent: false,
        ...(servername === undefined ? {} : { servername, headers: { host: servername } }),
      },
      (res) => {
        const peer = (res.socket as tls.TLSSocket).getPeerCertificate()
        let body = ''
        res.on('data', (chunk: Buffer) => (body += chunk.toString()))
        res.on('end', () => {
          resolve({ body, validFrom: peer.valid_from, validTo: peer.valid_to })
        })
      },
    )
    request.on('error', reject)
  })
}

describe('fixture certificates', () => {
  it('are refused until the test authority is trusted, then verify for their hosts', async () => {
    const port = await serve(['127.0.0.1', 'shop.example'], 90, 60)
    await expect(get(port)).rejects.toThrow()
    trustFixtureCa()
    await expect(get(port)).resolves.toMatchObject({ body: 'ok' })
    await expect(get(port, 'shop.example')).resolves.toMatchObject({ body: 'ok' })
    await expect(get(port, 'other.example')).rejects.toThrow(/altnames/)
  })

  it('run from and to the dates asked for', async () => {
    trustFixtureCa()
    const port = await serve(['127.0.0.1'], 90, 10)
    const { validFrom, validTo } = await get(port)
    const daysLeft = (Date.parse(validTo) - Date.now()) / 86_400_000
    const lifetime = (Date.parse(validTo) - Date.parse(validFrom)) / 86_400_000
    expect(daysLeft).toBeGreaterThan(9.9)
    expect(daysLeft).toBeLessThan(10.1)
    expect(Math.round(lifetime)).toBe(90)
  })
})

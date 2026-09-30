import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  loadFixtureConfig,
  resolveFixtureResponse,
  serveSite,
  sitePath,
  type FixtureSite,
} from '../src/index'

interface RawResponse {
  status: number
  headers: [string, string][]
  body: Buffer
}

/** Plain node:http client so the raw request path and raw header bytes stay visible. */
function request(url: string, method = 'GET', rawPath?: string): Promise<RawResponse> {
  const target = new URL(url)
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: target.hostname,
        port: target.port,
        path: rawPath ?? `${target.pathname}${target.search}`,
        method,
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const headers: [string, string][] = []
          for (let i = 0; i + 1 < res.rawHeaders.length; i += 2) {
            headers.push([(res.rawHeaders[i] ?? '').toLowerCase(), res.rawHeaders[i + 1] ?? ''])
          }
          resolve({ status: res.statusCode ?? 0, headers, body: Buffer.concat(chunks) })
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}

const header = (res: RawResponse, name: string) =>
  res.headers.filter(([key]) => key === name).map(([, value]) => value)

let site: FixtureSite

beforeAll(async () => {
  site = await serveSite(sitePath('sample'))
})

afterAll(async () => {
  await site.close()
})

describe('serveSite', () => {
  it('serves index.html at / as UTF-8 HTML', async () => {
    const res = await request(site.url('/'))
    expect(res.status).toBe(200)
    expect(header(res, 'content-type')).toEqual(['text/html; charset=utf-8'])
    expect(res.body.toString('utf8')).toContain('<html lang="ar" dir="rtl">')
  })

  it('serves directory indexes and robots.txt at the origin root', async () => {
    const about = await request(site.url('/about/'))
    expect(about.body.toString('utf8')).toContain('من نحن')
    const robots = await request(site.url('/robots.txt'))
    expect(robots.status).toBe(200)
    expect(header(robots, 'content-type')).toEqual(['text/plain; charset=utf-8'])
    expect(header(robots, 'cache-control')).toEqual(['max-age=60'])
    expect(robots.body.toString('utf8')).toBe('User-agent: *\nDisallow: /admin/\n')
  })

  it('returns 404 for missing files, fixture.json itself, and path traversal', async () => {
    expect((await request(site.url('/missing'))).status).toBe(404)
    expect((await request(site.url('/fixture.json'))).status).toBe(404)
    expect((await request(site.url('/'), 'GET', '/..%2Fpackage.json')).status).toBe(404)
  })

  it('applies fixture.json overrides: status, redirects and repeated headers', async () => {
    expect((await request(site.url('/gone'))).status).toBe(410)
    const old = await request(site.url('/old'))
    expect(old.status).toBe(301)
    expect(header(old, 'location')).toEqual(['/'])
    const tagged = await request(site.url('/tagged'))
    expect(tagged.status).toBe(200)
    expect(header(tagged, 'x-robots-tag')).toEqual(['noindex', 'googlebot: nofollow'])
    expect(tagged.body.toString('utf8')).toBe('tagged')
  })

  it('sends UTF-8 header values as raw bytes, like real servers', async () => {
    const res = await request(site.url('/arabic-location'))
    expect(res.status).toBe(302)
    const raw = header(res, 'location')[0] ?? ''
    expect(Buffer.from(raw, 'latin1').toString('utf8')).toBe('/منتجات/')
  })

  it('only answers GET and HEAD', async () => {
    expect((await request(site.url('/'), 'POST')).status).toBe(405)
    const head = await request(site.url('/'), 'HEAD')
    expect(head.status).toBe(200)
    expect(head.body.length).toBe(0)
  })

  it('gives every site its own origin', async () => {
    const other = await serveSite(sitePath('sample'))
    expect(other.origin).not.toBe(site.origin)
    await other.close()
  })

  it('does not serve expect.json, the rule tests’ metadata', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'arablyzer-fixture-'))
    await writeFile(path.join(dir, 'expect.json'), '{}')
    const hidden = await serveSite(dir)
    expect((await request(hidden.url('/expect.json'))).status).toBe(404)
    await hidden.close()
    await rm(dir, { recursive: true, force: true })
  })

  it('resolves responses without HTTP, exactly as the server sends them', async () => {
    const root = sitePath('sample')
    const config = await loadFixtureConfig(root)
    const tagged = await resolveFixtureResponse(root, config, '/tagged')
    expect(tagged).toEqual({
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'x-robots-tag': ['noindex', 'googlebot: nofollow'],
      },
      body: Buffer.from('tagged'),
    })
    expect((await resolveFixtureResponse(root, config, '/missing')).status).toBe(404)
  })

  it('rejects an invalid fixture.json and names the file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'arablyzer-fixture-'))
    await writeFile(path.join(dir, 'fixture.json'), JSON.stringify({ 'no-slash': { status: 200 } }))
    await expect(serveSite(dir)).rejects.toThrow(/fixture\.json/)
    await rm(dir, { recursive: true, force: true })
  })

  it('serves fixtures/shared/ under /_shared/ on every site, and nothing beside it', async () => {
    const font = await request(site.url('/_shared/fonts/arablyzer-test-arabic.ttf'))
    expect(font.status).toBe(200)
    expect(header(font, 'content-type')).toEqual(['font/ttf'])
    expect(font.body.subarray(0, 4)).toEqual(Buffer.from([0, 1, 0, 0]))
    for (const escape of ['/_shared/../src/server.ts', '/_shared/%2e%2e/package.json']) {
      expect((await request(site.url('/'), 'GET', escape)).status, escape).toBe(404)
    }
  })
})

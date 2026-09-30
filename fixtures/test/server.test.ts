import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  loadFixtureConfig,
  resolveFixtureResponse,
  serveHandler,
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

  it('answers HEAD with a status of its own where a route says so, as a server that refuses it', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'arablyzer-fixture-'))
    await writeFile(path.join(dir, 'index.html'), '<p>نص</p>')
    await writeFile(path.join(dir, 'fixture.json'), JSON.stringify({ '/': { headStatus: 405 } }))
    const refusing = await serveSite(dir)
    try {
      expect((await request(refusing.url('/'), 'HEAD')).status).toBe(405)
      expect((await request(refusing.url('/'))).status).toBe(200)
      const config = await loadFixtureConfig(dir)
      expect((await resolveFixtureResponse(dir, config, '/', { method: 'HEAD' })).status).toBe(405)
      expect((await resolveFixtureResponse(dir, config, '/')).status).toBe(200)
    } finally {
      await refusing.close()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('drops HEAD where a route says so: the connection closed, or nothing ever said', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'arablyzer-fixture-'))
    await writeFile(path.join(dir, 'index.html'), '<p>نص</p>')
    await writeFile(
      path.join(dir, 'fixture.json'),
      JSON.stringify({ '/': { headDrop: 'reset' }, '/quiet': { headDrop: 'silence' } }),
    )
    const dropping = await serveSite(dir)
    try {
      await expect(request(dropping.url('/'), 'HEAD')).rejects.toThrow(/socket hang up|ECONNRESET/)
      // A GET is answered as ever, and a route with nothing to say keeps the connection open.
      expect((await request(dropping.url('/'))).status).toBe(200)
      const silent = await new Promise<string>((resolve) => {
        const req = http.request(
          { host: '127.0.0.1', port: dropping.port, path: '/quiet', method: 'HEAD', agent: false },
          () => {
            resolve('answered')
          },
        )
        req.on('error', () => {
          resolve('error')
        })
        setTimeout(() => {
          resolve('silent')
          req.destroy()
        }, 300)
        req.end()
      })
      expect(silent).toBe('silent')
      const config = await loadFixtureConfig(dir)
      expect(await resolveFixtureResponse(dir, config, '/', { method: 'HEAD' })).toMatchObject({
        drop: 'reset',
      })
      expect(await resolveFixtureResponse(dir, config, '/quiet', { method: 'HEAD' })).toMatchObject(
        { drop: 'silence' },
      )
      expect((await resolveFixtureResponse(dir, config, '/')).drop).toBeUndefined()
    } finally {
      await dropping.close()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('gives every site its own origin', async () => {
    const other = await serveSite(sitePath('sample'))
    expect(other.origin).not.toBe(site.origin)
    await other.close()
  })

  it('keeps each request it answered, in order, so a test can tell what was asked for', async () => {
    const other = await serveSite(sitePath('sample'))
    await request(other.url('/robots.txt'))
    await request(other.url('/missing?q=1'))
    await request(other.url('/'), 'HEAD')
    await request(other.url('/'), 'POST')
    expect(other.requests).toEqual(['GET /robots.txt', 'GET /missing?q=1', 'HEAD /', 'POST /'])
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

describe('serveSite: compressed paths', () => {
  let root = ''
  let site: FixtureSite

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'arablyzer-gzip-'))
    await writeFile(path.join(root, 'index.html'), `<p>${'نص عربي '.repeat(200)}</p>`)
    await writeFile(path.join(root, 'fixture.json'), JSON.stringify({ '/': { compress: 'gzip' } }))
    site = await serveSite(root)
  })

  afterAll(async () => {
    await site.close()
    await rm(root, { recursive: true, force: true })
  })

  function get(acceptEncoding: string | null): Promise<RawResponse> {
    return new Promise((resolve, reject) => {
      const target = new URL(site.url('/'))
      const req = http.request(
        {
          host: target.hostname,
          port: target.port,
          path: '/',
          agent: false,
          headers: acceptEncoding === null ? {} : { 'accept-encoding': acceptEncoding },
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

  it('gzips every text response when asked to, as a production server does', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'arablyzer-gzip-all-'))
    await writeFile(path.join(dir, 'index.html'), `<p>${'نص عربي '.repeat(200)}</p>`)
    await writeFile(path.join(dir, 'style.css'), `p { color: red; }\n`.repeat(50))
    await writeFile(path.join(dir, 'font.woff2'), Buffer.alloc(2048, 7))
    const all = await serveSite(dir, { compressText: true })
    const encoding = (pathname: string) =>
      new Promise<string | undefined>((resolve, reject) => {
        const target = new URL(all.url(pathname))
        http
          .get(
            {
              host: target.hostname,
              port: target.port,
              path: pathname,
              agent: false,
              headers: { 'accept-encoding': 'gzip' },
            },
            (res) => {
              res.resume()
              res.on('end', () => {
                resolve(res.headers['content-encoding'])
              })
            },
          )
          .on('error', reject)
      })
    try {
      expect(await encoding('/')).toBe('gzip')
      expect(await encoding('/style.css')).toBe('gzip')
      expect(await encoding('/font.woff2')).toBeUndefined()
      expect(await encoding('/missing.html')).toBeUndefined()
    } finally {
      await all.close()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('serves a page without its .html when asked to, as the site does', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'arablyzer-clean-'))
    await mkdir(path.join(dir, 'tools'), { recursive: true })
    await writeFile(path.join(dir, 'tools', 'rtl-check.html'), '<p>rtl</p>')
    const clean = await resolveFixtureResponse(dir, {}, '/tools/rtl-check', { cleanUrls: true })
    const strict = await resolveFixtureResponse(dir, {}, '/tools/rtl-check')
    const escape = await resolveFixtureResponse(dir, {}, '/../server', { cleanUrls: true })
    try {
      expect([clean.status, clean.body.toString()]).toEqual([200, '<p>rtl</p>'])
      expect(clean.headers['content-type']).toBe('text/html; charset=utf-8')
      expect(strict.status).toBe(404)
      expect(escape.status).toBe(404)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('sends gzip to a client that accepts it, and the file as it is otherwise', async () => {
    const gzipped = await get('gzip, deflate, br')
    expect(gzipped.headers).toContainEqual(['content-encoding', 'gzip'])
    expect(gzipped.body[0]).toBe(0x1f)
    const plain = await get(null)
    expect(plain.headers.some(([name]) => name === 'content-encoding')).toBe(false)
    expect(plain.body.toString('utf8')).toContain('نص عربي')
    expect(gzipped.body.length).toBeLessThan(plain.body.length)
  })
})

describe('serveSite: a site under several names', () => {
  let root = ''
  let site: FixtureSite

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'arablyzer-names-'))
    await writeFile(path.join(root, 'index.html'), '<p>page</p>')
    await writeFile(
      path.join(root, 'robots.txt'),
      [
        'User-agent: *',
        'Sitemap: http://shop.example/sitemap.xml',
        'sitemap:http://www.shop.example/ar/sitemap.xml',
        'Sitemap: http://other.example/sitemap.xml',
        'Sitemap: http://shop.example:8080/pinned.xml',
        'Sitemap: /sitemap.xml',
        '',
      ].join('\n'),
    )
    await writeFile(
      path.join(root, 'site.json'),
      JSON.stringify({ host: 'shop.example', aliases: ['www.shop.example'] }),
    )
    await writeFile(
      path.join(root, 'fixture.json'),
      JSON.stringify({
        '/': { status: 302, headers: { location: 'http://www.shop.example/' } },
        '//www.shop.example/': { headers: { 'x-name': 'www' } },
        '/elsewhere': { status: 301, headers: { location: 'http://other.example/' } },
        '/pinned': { status: 301, headers: { location: 'http://www.shop.example:8080/' } },
      }),
    )
    site = await serveSite(root)
  })

  afterAll(async () => {
    await site.close()
    await rm(root, { recursive: true, force: true })
  })

  /** A request to the site's own port, for one of its names. */
  function requestAs(host: string, pathname: string): Promise<RawResponse> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: site.port,
          path: pathname,
          agent: false,
          headers: { host: `${host}:${String(site.port)}` },
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

  it('names every name it answers to', () => {
    expect(site.hostnames).toEqual(['shop.example', 'www.shop.example'])
  })

  it('sends a redirect to one of its names back to its own port', async () => {
    const moved = await requestAs('shop.example', '/')
    expect(moved.status).toBe(302)
    expect(header(moved, 'location')).toEqual([`http://www.shop.example:${String(site.port)}/`])
    // Another site's address, or one with a port of its own, stays as written.
    expect(header(await requestAs('shop.example', '/elsewhere'), 'location')).toEqual([
      'http://other.example/',
    ])
    expect(header(await requestAs('shop.example', '/pinned'), 'location')).toEqual([
      'http://www.shop.example:8080/',
    ])
  })

  it('sends Sitemap lines of robots.txt that name its own URLs back to its own port', async () => {
    const port = String(site.port)
    const robots = await requestAs('shop.example', '/robots.txt')
    expect(robots.body.toString('utf8').split('\n')).toEqual([
      'User-agent: *',
      `Sitemap: http://shop.example:${port}/sitemap.xml`,
      `sitemap:http://www.shop.example:${port}/ar/sitemap.xml`,
      // Another site's address, one with a port of its own, and a path stay as written.
      'Sitemap: http://other.example/sitemap.xml',
      'Sitemap: http://shop.example:8080/pinned.xml',
      'Sitemap: /sitemap.xml',
      '',
    ])
    // Read without HTTP, the file is as written: it has no port to give.
    const config = await loadFixtureConfig(root)
    const resolved = await resolveFixtureResponse(root, config, '/robots.txt')
    expect(resolved.body.toString('utf8')).toContain('Sitemap: http://shop.example/sitemap.xml')
  })

  it('answers an alias with its own route, and the site’s files', async () => {
    const page = await requestAs('www.shop.example', '/')
    expect(page.status).toBe(200)
    expect(header(page, 'x-name')).toEqual(['www'])
    expect(page.body.toString('utf8')).toBe('<p>page</p>')
    // A path without a route of the alias's own is the same on every name.
    expect((await requestAs('www.shop.example', '/elsewhere')).status).toBe(301)
    const config = await loadFixtureConfig(root)
    const resolved = await resolveFixtureResponse(root, config, '/', { host: 'www.shop.example' })
    expect([resolved.status, resolved.headers['x-name']]).toEqual([200, 'www'])
  })

  it('refuses a route for a name it does not have, and aliases without a host', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'arablyzer-names-bad-'))
    try {
      await writeFile(path.join(dir, 'site.json'), JSON.stringify({ host: 'shop.example' }))
      await writeFile(path.join(dir, 'fixture.json'), JSON.stringify({ '//www.shop.example/': {} }))
      await expect(serveSite(dir)).rejects.toThrow(/names no host of the site/)
      await writeFile(
        path.join(dir, 'site.json'),
        JSON.stringify({ aliases: ['www.shop.example'] }),
      )
      await expect(serveSite(dir)).rejects.toThrow(/aliases need a host/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('serveHandler', () => {
  it('answers as its handler says, by who asks, and lets go of its port when closed', async () => {
    const handled = await serveHandler((req, res) => {
      const browser = (req.headers['user-agent'] ?? '').includes('Mozilla')
      res.writeHead(browser ? 403 : 200, { 'content-type': 'text/plain' })
      res.end(browser ? 'challenge' : 'page')
    })
    try {
      // The client of this file sends no user agent: the handler sees a caller that is no browser.
      const plain = await request(handled.url('/'))
      expect([plain.status, plain.body.toString('utf8')]).toEqual([200, 'page'])
      expect(handled.url('/a?b=1')).toBe(`http://127.0.0.1:${handled.port}/a?b=1`)
    } finally {
      await handled.close()
    }
    await expect(request(`http://127.0.0.1:${handled.port}/`)).rejects.toThrow()
  })
})

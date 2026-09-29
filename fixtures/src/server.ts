import { readFile, stat } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { FixtureConfig, SiteConfig, type RouteOverride } from './config'
import { certificateWindow, serverCertificate } from './tls'

export interface FixtureSite {
  readonly origin: string
  readonly port: number
  /** The host name the site is scanned under: 127.0.0.1, or its site.json host. */
  readonly hostname: string
  /**
   * Each request it answered, in order, as "GET /path?query": what a scan asked the site for,
   * and what it never did.
   */
  readonly requests: readonly string[]
  url(pathname?: string): string
  close(): Promise<void>
}

const CONFIG_FILE = 'fixture.json'
const SITE_FILE = 'site.json'
/** Test metadata that sits next to the site files but is not part of the site. */
const HIDDEN_FILES = new Set([CONFIG_FILE, SITE_FILE, 'expect.json'])
/** Paths under this prefix come from fixtures/shared/, whatever the site. */
export const SHARED_PREFIX = '/_shared/'
const SHARED_ROOT = path.resolve(fileURLToPath(new URL('../shared/', import.meta.url)))

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

export async function loadFixtureConfig(root: string): Promise<FixtureConfig> {
  const file = path.join(root, CONFIG_FILE)
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if (isNotFound(error)) return {}
    throw error
  }
  const parsed = FixtureConfig.safeParse(JSON.parse(text))
  if (!parsed.success) throw new Error(`Invalid ${file}:\n${z.prettifyError(parsed.error)}`)
  return parsed.data
}

export async function loadSiteConfig(root: string): Promise<SiteConfig> {
  const file = path.join(root, SITE_FILE)
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if (isNotFound(error)) return {}
    throw error
  }
  const parsed = SiteConfig.safeParse(JSON.parse(text))
  if (!parsed.success) throw new Error(`Invalid ${file}:\n${z.prettifyError(parsed.error)}`)
  return parsed.data
}

export interface ServeOptions {
  /** A free port by default; the golden reports name their pages by a fixed one. */
  readonly port?: number
  /**
   * Gzip every text response to a client that accepts it, as a production server does: the
   * site's own build is measured this way (M2.1 plan §3). Fixture sites name their paths in
   * fixture.json instead.
   */
  readonly compressText?: boolean
  /**
   * Serve /tools/x from tools/x.html when there is no tools/x, as the site's server does for
   * the pages Astro builds (M2.1).
   */
  readonly cleanUrls?: boolean
}

/**
 * Serve one fixture site directory on its own 127.0.0.1 origin, so /robots.txt sits at the root;
 * over HTTPS, and under a host name of its own, when its site.json asks.
 */
export async function serveSite(
  root: string,
  { port = 0, compressText = false, cleanUrls = false }: ServeOptions = {},
): Promise<FixtureSite> {
  const siteRoot = path.resolve(root)
  const config = await loadFixtureConfig(siteRoot)
  const site = await loadSiteConfig(siteRoot)
  const hostname = site.host ?? '127.0.0.1'
  // One array for the site's life: a copy of the site object still sees every request.
  const requests: string[] = []
  const handler: http.RequestListener = (req, res) => {
    requests.push(`${req.method ?? ''} ${req.url ?? ''}`)
    respond(siteRoot, config, { compressText, cleanUrls }, req, res).catch((error: unknown) => {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(String(error))
    })
  }
  const server =
    site.tls === undefined
      ? http.createServer(handler)
      : https.createServer(
          serverCertificate(
            [hostname, ...(hostname === '127.0.0.1' ? [] : ['127.0.0.1'])],
            ...certificateWindow(site.tls.lifetimeDays, site.tls.daysLeft),
          ),
          handler,
        )
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('Fixture server has no TCP address')
  }
  const origin = `${site.tls === undefined ? 'http' : 'https'}://${hostname}:${address.port}`
  return {
    origin,
    port: address.port,
    hostname,
    requests,
    url: (pathname = '/') => new URL(pathname, origin).href,
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections()
        server.close((error) => {
          if (error) reject(error)
          else resolve()
        })
      }),
  }
}

const TEXT_TYPE = /^(?:text\/|application\/(?:javascript|json|xml)|image\/svg\+xml)/

async function respond(
  root: string,
  config: FixtureConfig,
  { compressText, cleanUrls }: { compressText: boolean; cleanUrls: boolean },
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' })
    res.end()
    return
  }
  const pathname = new URL(req.url ?? '/', 'http://fixture.invalid').pathname
  const { status, headers, body } = await resolveFixtureResponse(root, config, pathname, {
    cleanUrls,
  })
  const contentType = headers['content-type']
  const text = typeof contentType === 'string' && TEXT_TYPE.test(contentType)
  const gzip =
    (config[pathname]?.compress === 'gzip' || (compressText && text && status === 200)) &&
    /\bgzip\b/i.test(req.headers['accept-encoding'] ?? '')
  const sent = gzip ? gzipSync(body) : body
  res.writeHead(
    status,
    wireHeaders(
      gzip ? { ...headers, 'content-encoding': 'gzip', vary: 'Accept-Encoding' } : headers,
    ),
  )
  res.end(req.method === 'HEAD' ? undefined : sent)
}

export interface FixtureResponse {
  readonly status: number
  /** Lowercased names; a list for repeated headers. */
  readonly headers: Record<string, string | string[]>
  readonly body: Buffer
}

/** What the server answers for a path; rule tests use it to read fixtures without HTTP. */
export async function resolveFixtureResponse(
  root: string,
  config: FixtureConfig,
  pathname: string,
  { cleanUrls = false }: { cleanUrls?: boolean } = {},
): Promise<FixtureResponse> {
  const siteRoot = path.resolve(root)
  const override: RouteOverride | undefined = config[pathname]
  const file =
    (await readSiteFile(siteRoot, pathname)) ??
    (cleanUrls && !pathname.endsWith('/') && path.extname(pathname) === ''
      ? await readSiteFile(siteRoot, `${pathname}.html`)
      : null)
  // An inline body stands in for the file, so it is a 200 unless the override says otherwise.
  const status = override?.status ?? (file === null && override?.body === undefined ? 404 : 200)
  const body =
    override?.body !== undefined
      ? Buffer.from(override.body, 'utf8')
      : (file?.body ?? Buffer.from(status === 404 ? 'Not Found' : ''))
  const headers: Record<string, string | string[]> = {
    'content-type': file?.contentType ?? 'text/plain; charset=utf-8',
  }
  for (const [name, value] of Object.entries(override?.headers ?? {})) {
    headers[name.toLowerCase()] = value
  }
  return { status, headers, body }
}

/** Node only writes latin1 header text; send UTF-8 values (Arabic paths) as raw bytes, like real servers. */
function wireHeaders(
  headers: Record<string, string | string[]>,
): Record<string, string | string[]> {
  const toWire = (value: string) =>
    hasCharAbove(value, 0xff) ? Buffer.from(value, 'utf8').toString('latin1') : value
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      Array.isArray(value) ? value.map(toWire) : toWire(value),
    ]),
  )
}

function hasCharAbove(value: string, max: number): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > max) return true
  }
  return false
}

async function readSiteFile(
  root: string,
  pathname: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  // Assets several sites share (test fonts) are served from fixtures/shared/ on every site.
  const shared = decoded.startsWith(SHARED_PREFIX)
  const base = shared ? SHARED_ROOT : root
  const inside = shared ? decoded.slice(SHARED_PREFIX.length - 1) : decoded
  const relative = inside.endsWith('/') ? `${inside}index.html` : inside
  const filePath = path.resolve(base, `.${relative}`)
  if (!filePath.startsWith(base + path.sep) || HIDDEN_FILES.has(path.basename(filePath)))
    return null
  try {
    const info = await stat(filePath)
    if (!info.isFile()) return null
    const contentType =
      CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    return { body: await readFile(filePath), contentType }
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

import { writeFile } from 'node:fs/promises'
// A stand-in server that answers each ask as the test says (the fixture site answers one way).
// eslint-disable-next-line no-restricted-imports
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import path from 'node:path'
import { createPolicy } from '@arablyzer/egress'
import { afterEach, describe, expect, it } from 'vitest'
import { crawlDelayOf, createCrawler, lightRuleIds } from '../src/index'
import { policyFor, resolverFor, tempSite, type TempSite } from './helpers'

// M4.5: the engine's part of a deep crawl: robots.txt that counts `*`, one page's facts, the
// start addresses from sitemaps. Pages come from a fixture site served on this machine.

let sites: TempSite[] = []
afterEach(async () => {
  await Promise.all(sites.map((site) => site.close()))
  sites = []
})
async function site(files: Record<string, string>): Promise<TempSite> {
  const created = await tempSite(files)
  sites.push(created)
  return created
}

/** A public name the fixture server answers to, so a sitemap can name its own URLs. */
const SHOP = JSON.stringify({ host: 'shop.example' })

const page = (body: string, title = 'Page') =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`

describe('crawlDelayOf', () => {
  it('reads the group that names the bot, else *', () => {
    const body = 'User-agent: *\nCrawl-delay: 5\n\nUser-agent: ArablyzerBot\nCrawl-delay: 2\n'
    expect(crawlDelayOf(body)).toBe(2000)
    expect(crawlDelayOf('User-agent: *\nCrawl-delay: 1.5')).toBe(1500)
    expect(crawlDelayOf('User-agent: other\nCrawl-delay: 9')).toBeNull()
    expect(crawlDelayOf('User-agent: *\nCrawl-delay: soon')).toBeNull()
  })
})

describe('lightRuleIds', () => {
  it('keeps the rules that need nothing from outside the page', () => {
    const ids = lightRuleIds()
    expect(ids.length).toBeGreaterThan(10)
    expect(ids).not.toContain('page-speed')
  })
})

describe('the crawler', () => {
  it('reads a page: its links to its own site, its skeleton, the issues of the HTML checks', async () => {
    const local = await site({
      'index.html': page(
        '<main><section><ul><li><a href="/a">A</a></li><li><a href="/b?x=1#top">B</a></li></ul></section></main><a href="https://elsewhere.example/">out</a><a href="/doc.pdf">pdf</a>',
      ),
    })
    const crawler = createCrawler({ policy: policyFor(local) })
    const result = await crawler.page(local.url('/'))
    expect(result.outcome).toBe('ok')
    expect(result.status).toBe(200)
    expect(result.title).toBe('Page')
    expect(result.links).toEqual([local.url('/a'), local.url('/b?x=1')])
    expect(result.skeleton).toContain('main>section>ul')
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues.every((issue) => issue.count >= 1)).toBe(true)
  })

  it('never asks for a page that robots.txt keeps crawlers from, and reports the pause it asks for', async () => {
    const local = await site({
      'index.html': page('<p>x</p>'),
      'private/index.html': page('<p>secret</p>'),
      'robots.txt': 'User-agent: *\nDisallow: /private\nCrawl-delay: 3\n',
    })
    const crawler = createCrawler({ policy: policyFor(local) })
    const blocked = await crawler.page(local.url('/private/'))
    expect(blocked).toMatchObject({ outcome: 'blocked', error: 'robots', crawlDelayMs: 3000 })
    expect(local.requests).toEqual(['GET /robots.txt'])
    const allowed = await crawler.page(local.url('/'))
    expect(allowed).toMatchObject({ outcome: 'ok', crawlDelayMs: 3000 })
    // robots.txt was read once for the site.
    expect(local.requests.filter((request) => request === 'GET /robots.txt')).toHaveLength(1)
  })

  it('reports a page that answers an error, and one that is not HTML', async () => {
    const local = await site({ 'data.txt': 'plain', 'index.html': page('<p>x</p>') })
    const crawler = createCrawler({ policy: policyFor(local) })
    expect(await crawler.page(local.url('/missing'))).toMatchObject({
      outcome: 'error',
      status: 404,
      error: 'http-404',
    })
    expect((await crawler.page(local.url('/data.txt'))).outcome).toBe('not-html')
  })

  it('lists the pages of a sitemap index, of its own origin and allowed by robots.txt', async () => {
    const NS = 'http://www.sitemaps.org/schemas/sitemap/0.9'
    const local = await site({
      'site.json': SHOP,
      'index.html': page('<p>x</p>'),
      'robots.txt':
        'User-agent: *\nDisallow: /private\nCrawl-delay: 1\nSitemap: http://shop.example/index.xml\n',
    })
    // A sitemap names its pages with the port the server was given, so it is written once it is up.
    const own = new URL(local.url('/')).origin
    await writeFile(
      path.join(local.root, 'index.xml'),
      `<sitemapindex xmlns="${NS}"><sitemap><loc>${own}/s1.xml</loc></sitemap></sitemapindex>`,
    )
    await writeFile(
      path.join(local.root, 's1.xml'),
      `<urlset xmlns="${NS}"><url><loc>${own}/products/a</loc></url><url><loc>${own}/private/b</loc></url><url><loc>https://other.example/c</loc></url><url><loc>${own}/blog?a=1&amp;b=2</loc></url></urlset>`,
    )
    const crawler = createCrawler({ policy: policyFor(local), resolver: resolverFor(local) })
    const origin = new URL(local.url('/')).origin
    const seeds = await crawler.seeds(origin)
    expect(seeds).toMatchObject({ robots: 'fetched', crawlDelayMs: 1000, sitemaps: 2, more: false })
    expect(seeds.urls).toEqual([`${origin}/products/a`, `${origin}/blog?a=1&b=2`])
  })

  it('tries /sitemap.xml when robots.txt names none, and survives a site without one', async () => {
    const local = await site({ 'site.json': SHOP, 'index.html': page('<p>x</p>') })
    const crawler = createCrawler({ policy: policyFor(local), resolver: resolverFor(local) })
    const seeds = await crawler.seeds(new URL(local.url('/')).origin)
    expect(seeds).toMatchObject({ robots: 'none', sitemaps: 1, urls: [] })
    expect(local.requests).toEqual(['GET /robots.txt', 'GET /sitemap.xml'])
  })
})

// robots.txt as RFC 9309 reads what a server answers (the table at `robotsOf` in crawl.ts).

interface Probe {
  readonly port: number
  readonly origin: string
  /** Every request, as `GET /path`, in order. */
  readonly hits: string[]
  close(): Promise<void>
}
/** Answers the nth request for that path (from 1). */
type Answer = (request: IncomingMessage, response: ServerResponse, nth: number) => void

let probes: Probe[] = []
afterEach(async () => {
  await Promise.all(probes.map((probe) => probe.close()))
  probes = []
})

async function probe(answer: Answer): Promise<Probe> {
  const hits: string[] = []
  const server = http.createServer((request, response) => {
    const key = `${request.method ?? 'GET'} ${request.url ?? '/'}`
    hits.push(key)
    answer(request, response, hits.filter((hit) => hit === key).length)
  })
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
  const port = (server.address() as { port: number }).port
  const made: Probe = {
    port,
    origin: `http://127.0.0.1:${String(port)}`,
    hits,
    close: () =>
      new Promise<void>((done) => {
        server.closeAllConnections()
        server.close(() => {
          done()
        })
      }),
  }
  probes.push(made)
  return made
}

const send = (response: ServerResponse, status: number, body = '', headers = {}) => {
  response.writeHead(status, { 'content-type': 'text/plain', ...headers })
  response.end(body)
}
const robotsFile =
  (body: string): Answer =>
  (_request, response) => {
    send(response, 200, body)
  }
/** A site whose pages are HTML and whose /robots.txt is answered by `robots`. */
const siteWith =
  (robots: Answer): Answer =>
  (request, response, nth) => {
    if (request.url !== '/robots.txt') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(page('<p>hello</p>'))
      return
    }
    robots(request, response, nth)
  }
const crawlerFor = (servers: Probe[], timeoutMs = 2_000) =>
  createCrawler({
    policy: createPolicy({
      allowTargets: servers.map((server) => ({ address: '127.0.0.1', port: server.port })),
    }),
    timeoutMs,
    robotsRetryDelayMs: 0,
  })
const robotsHits = (server: Probe) => server.hits.filter((hit) => hit === 'GET /robots.txt')
const DISALLOW_PRIVATE = 'User-agent: *\nDisallow: /private\n'

describe('the crawler reads robots.txt as RFC 9309 says', () => {
  it('follows a redirect to another host, and the file it finds is the site’s own', async () => {
    const elsewhere = await probe(robotsFile(DISALLOW_PRIVATE))
    const site = await probe(
      siteWith((_request, response) => {
        send(response, 301, '', { location: `${elsewhere.origin}/robots.txt` })
      }),
    )
    const crawler = crawlerFor([site, elsewhere])
    expect((await crawler.page(`${site.origin}/`)).outcome).toBe('ok')
    expect(await crawler.page(`${site.origin}/private/x`)).toMatchObject({
      outcome: 'blocked',
      error: 'robots',
    })
    expect(elsewhere.hits).toEqual(['GET /robots.txt'])
    expect(robotsHits(site)).toHaveLength(1)
  })

  it('follows five redirects, and takes a sixth as no robots.txt at all', async () => {
    // /robots.txt -> /r1 -> ... -> /r<last>, which is the file.
    const chain =
      (last: number): Answer =>
      (request, response) => {
        const at = request.url === '/robots.txt' ? 0 : Number((request.url ?? '').slice(2))
        if (at < last) send(response, 301, '', { location: `/r${String(at + 1)}` })
        else send(response, 200, 'User-agent: *\nDisallow: /\n')
      }
    const asks =
      (robots: Answer): Answer =>
      (request, response, nth) => {
        if (request.url === '/robots.txt' || /^\/r\d$/.test(request.url ?? '')) {
          robots(request, response, nth)
        } else {
          siteWith(robots)(request, response, nth)
        }
      }
    const five = await probe(asks(chain(5)))
    expect(await crawlerFor([five]).page(`${five.origin}/`)).toMatchObject({
      outcome: 'blocked',
      error: 'robots',
    })
    const six = await probe(asks(chain(6)))
    expect((await crawlerFor([six]).page(`${six.origin}/`)).outcome).toBe('ok')
  })

  it.each([401, 403, 404, 410, 451])(
    'lets the crawler in when robots.txt answers %i, and asks once',
    async (status) => {
      const site = await probe(
        siteWith((_request, response) => {
          send(response, status)
        }),
      )
      expect((await crawlerFor([site]).page(`${site.origin}/`)).outcome).toBe('ok')
      expect(robotsHits(site)).toHaveLength(1)
    },
  )

  it('lets the crawler in when a redirect ends on a 404', async () => {
    const gone = await probe((_request, response) => {
      send(response, 404)
    })
    const site = await probe(
      siteWith((_request, response) => {
        send(response, 302, '', { location: `${gone.origin}/robots.txt` })
      }),
    )
    expect((await crawlerFor([site, gone]).page(`${site.origin}/`)).outcome).toBe('ok')
    expect(gone.hits).toEqual(['GET /robots.txt'])
  })

  it.each([500, 503, 429])(
    'asks again after a %i, and follows the file it then gets',
    async (status) => {
      const site = await probe(
        siteWith((_request, response, nth) => {
          if (nth === 1) send(response, status)
          else send(response, 200, DISALLOW_PRIVATE)
        }),
      )
      const crawler = crawlerFor([site])
      expect((await crawler.page(`${site.origin}/`)).outcome).toBe('ok')
      expect(await crawler.page(`${site.origin}/private/x`)).toMatchObject({ error: 'robots' })
      expect(robotsHits(site)).toHaveLength(2)
    },
  )

  it('keeps the crawler out of a site whose robots.txt fails twice, without asking for its page', async () => {
    const site = await probe(
      siteWith((_request, response) => {
        send(response, 503)
      }),
    )
    const crawler = crawlerFor([site])
    expect(await crawler.page(`${site.origin}/`)).toMatchObject({
      outcome: 'blocked',
      error: 'robots-unreachable',
    })
    expect(site.hits).toEqual(['GET /robots.txt', 'GET /robots.txt'])
    expect(await crawler.seeds(site.origin)).toMatchObject({ robots: 'blocked', urls: [] })
    // The answer is kept for ten minutes: no third ask.
    expect(robotsHits(site)).toHaveLength(2)
  })

  it('asks again after a timeout, and gives the second ask twice the time', async () => {
    const site = await probe(
      siteWith((_request, response, nth) => {
        // The first answer is late for 300 ms; the second, after 450 ms, is within the retry's 600.
        setTimeout(
          () => {
            if (!response.destroyed) send(response, 200, DISALLOW_PRIVATE)
          },
          nth === 1 ? 5_000 : 450,
        )
      }),
    )
    expect(await crawlerFor([site], 300).page(`${site.origin}/private/x`)).toMatchObject({
      error: 'robots',
    })
    expect(robotsHits(site)).toHaveLength(2)
  })

  it('keeps the crawler out of a site that never answers, after the second ask', async () => {
    const site = await probe(siteWith(() => undefined))
    expect(await crawlerFor([site], 150).page(`${site.origin}/`)).toMatchObject({
      outcome: 'blocked',
      error: 'robots-unreachable',
    })
    expect(site.hits).toEqual(['GET /robots.txt', 'GET /robots.txt'])
  })

  it('does not ask again once the call is aborted', async () => {
    const site = await probe(
      siteWith((_request, response) => {
        send(response, 503)
      }),
    )
    const controller = new AbortController()
    const crawler = createCrawler({
      policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
      timeoutMs: 2_000,
      robotsRetryDelayMs: 60_000,
    })
    const pending = crawler.page(`${site.origin}/`, { signal: controller.signal })
    await new Promise((wait) => setTimeout(wait, 150))
    controller.abort()
    expect(await pending).toMatchObject({ outcome: 'blocked', error: 'robots-unreachable' })
    expect(robotsHits(site)).toHaveLength(1)
  })

  it('calls a bot challenge in place of robots.txt a bot challenge, not an unreadable file, and asks once', async () => {
    const challenged = await probe(
      siteWith((_request, response) => {
        send(response, 403, '<html>Just a moment...</html>', { 'cf-mitigated': 'challenge' })
      }),
    )
    expect(await crawlerFor([challenged]).page(`${challenged.origin}/`)).toMatchObject({
      outcome: 'blocked',
      error: 'bot-challenge',
    })
    expect(challenged.hits).toEqual(['GET /robots.txt'])
    // The same behind a redirect, as a site's apex sends to its www.
    const apex = await probe(
      siteWith((_request, response) => {
        send(response, 301, '', { location: `${challenged.origin}/robots.txt` })
      }),
    )
    expect(await crawlerFor([apex, challenged]).page(`${apex.origin}/`)).toMatchObject({
      outcome: 'blocked',
      error: 'bot-challenge',
    })
  })
})

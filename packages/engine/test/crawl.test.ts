import { writeFile } from 'node:fs/promises'
import path from 'node:path'
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

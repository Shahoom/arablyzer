import { collectPage, lossOf, parseRobotsTxt } from '@arablyzer/collectors'
import { createPolicy, safeFetch } from '@arablyzer/egress'
import { serveHandler, type HandlerSite } from '@arablyzer/fixtures'
import { robotsMatcher } from '@arablyzer/rules'
import { afterEach, describe, expect, it } from 'vitest'
import { scan } from '../src/index'
import { MAX_SEARCH_REQUESTS, runSearchTest } from '../src/search-test'

// docs/design/plans/arabic-native.md §2: the site's search, asked for words of the page and their
// spelling variants, at most a dozen times, as the site's robots.txt allows.

const POSTS: readonly { path: string; title: string }[] = [
  { path: '/post/1', title: 'مكتبة الأطفال الجديدة' },
  { path: '/post/2', title: 'أطفال المدرسة والمكتبة' },
  { path: '/post/3', title: 'مكتبة القصص العربية' },
  { path: '/post/4', title: 'قصص أطفال قصيرة' },
]

const fold = (text: string) =>
  text
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))

const HOME = `<!doctype html><html lang="ar" dir="rtl"><head><title>مكتبة النور</title></head><body>
<nav><a href="/">الرئيسية</a> <a href="/about">من نحن</a></nav>
<form role="search" method="get" action="/"><input type="search" name="s"></form>
<h1>مكتبة النور للأطفال</h1><p>مكتبة الأطفال وقصص المدرسة العربية. أطفال المدرسة يحبون المكتبة.</p>
<footer><a href="/contact">اتصل بنا</a></footer></body></html>`

/** What the stand-in site uses of a request and a response (node:http's, which tests may not import). */
interface Req {
  readonly url?: string | undefined
  readonly method?: string | undefined
}
interface Res {
  writeHead(status: number, headers?: Record<string, string>): unknown
  end(body?: string): unknown
}

interface Search {
  readonly site: HandlerSite
  readonly requests: string[]
}

/** A site whose search matches the exact letters, or, `normalizing`, the folded letters. */
async function serveSearch(
  options: { normalizing?: boolean; robots?: string; searchStatus?: number } = {},
): Promise<Search> {
  const requests: string[] = []
  const site = await serveHandler((request: Req, response: Res) => {
    const url = new URL(request.url ?? '/', 'http://site.test')
    if (url.pathname === '/robots.txt') {
      response.writeHead(options.robots === undefined ? 404 : 200, {
        'content-type': 'text/plain',
      })
      response.end(options.robots ?? '')
      return
    }
    const query = url.searchParams.get('s')
    if (query !== null) requests.push(`${request.method ?? ''} ${request.url ?? ''}`)
    if (query !== null && options.searchStatus !== undefined) {
      response.writeHead(options.searchStatus)
      response.end()
      return
    }
    const hits =
      query === null
        ? []
        : POSTS.filter((post) =>
            options.normalizing === true
              ? fold(post.title).includes(fold(query))
              : post.title.includes(query),
          )
    const chrome = '<nav><a href="/">الرئيسية</a> <a href="/about">من نحن</a></nav>'
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(
      query === null
        ? HOME
        : `<!doctype html><html lang="ar"><title>بحث</title><body>${chrome}${hits
            .map((post) => `<article><a href="${post.path}">${post.title}</a></article>`)
            .join('')}<footer><a href="/contact">اتصل بنا</a></footer></body></html>`,
    )
  })
  return { site, requests }
}

const policyFor = (site: HandlerSite) =>
  createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] })

async function homePage(site: HandlerSite) {
  const fetched = await safeFetch(site.url('/'), {
    userAgent: 'ArablyzerBot/1',
    policy: policyFor(site),
  })
  if (fetched.response === null) throw new Error('The test site did not answer')
  return collectPage({
    url: site.url('/'),
    status: 200,
    headers: [['content-type', 'text/html; charset=utf-8']],
    body: fetched.response.body,
    certificate: null,
  })
}

describe('runSearchTest', () => {
  let search: Search | undefined
  afterEach(async () => {
    await search?.site.close()
    search = undefined
  })

  const run = async (options: Parameters<typeof serveSearch>[0] = {}, robots?: string) => {
    search = await serveSearch(options)
    const page = await homePage(search.site)
    const matcher =
      robots === undefined
        ? undefined
        : robotsMatcher(parseRobotsTxt(new TextEncoder().encode(robots)), 'ArablyzerBot')
    return runSearchTest(page, {
      base: {
        userAgent: 'ArablyzerBot/1.0 (+https://arablyzer.example/bot)',
        policy: policyFor(search.site),
      },
      optedOut: (url) => (matcher === undefined ? false : !matcher(url).allowed),
      platformId: null,
      pauseMs: 0,
    })
  }

  it('finds a search that matches the exact letters losing variants', async () => {
    const facts = await run()
    expect(facts.outcome).toBe('tested')
    if (facts.outcome !== 'tested') return
    expect(facts.via).toBe('form')
    expect(facts.param).toBe('s')
    expect(facts.requests).toBeLessThanOrEqual(MAX_SEARCH_REQUESTS)
    expect(search?.requests.length).toBe(facts.requests)
    expect(search?.requests.every((line) => line.startsWith('GET /?s='))).toBe(true)
    const [first] = facts.words
    expect(first?.word).toBe('مكتبة')
    expect(first?.base.results).toBe(3)
    const lost = facts.words.flatMap((word) =>
      word.variants.filter((variant) => variant.counted && variant.outcome === 'lost'),
    )
    expect(lost.length).toBeGreaterThan(0)
    // The chat spelling is shown, and never counted.
    expect(
      facts.words.flatMap((word) => word.variants).find((variant) => variant.kind === 'arabizi')
        ?.counted,
    ).toBe(false)
  })

  it('finds no loss in a search that folds letters', async () => {
    const facts = await run({ normalizing: true })
    expect(facts.outcome).toBe('tested')
    if (facts.outcome !== 'tested') return
    expect(lossOf(facts.words)).toMatchObject({ lost: 0 })
    expect(lossOf(facts.words).total).toBeGreaterThan(0)
  })

  it('asks nothing where robots.txt keeps the bot from the search', async () => {
    const robots = 'User-agent: *\nDisallow: /?s=\n'
    const facts = await run({ robots }, robots)
    expect(facts).toMatchObject({ outcome: 'robots', via: 'form' })
    expect(search?.requests).toEqual([])
  })

  it('stops, and says it could not read the search, when its answer is an error', async () => {
    const facts = await run({ searchStatus: 500 })
    expect(facts).toMatchObject({ outcome: 'unreachable' })
    expect(search?.requests).toHaveLength(1)
  })

  it('finds nothing to ask on a page with no search', async () => {
    search = await serveSearch()
    const page = collectPage({
      url: search.site.url('/'),
      status: 200,
      headers: [['content-type', 'text/html']],
      body: new TextEncoder().encode('<html><body><h1>مكتبة النور</h1></body></html>'),
      certificate: null,
    })
    const facts = await runSearchTest(page, {
      base: { userAgent: 'ArablyzerBot/1', policy: policyFor(search.site) },
      optedOut: () => false,
      platformId: null,
      pauseMs: 0,
    })
    expect(facts).toEqual({ outcome: 'not-found' })
  })
})

describe('scan with the rule', () => {
  it('runs only when the rules are named, with a pause, and reports the loss on the facts', async () => {
    const search = await serveSearch()
    try {
      const report = await scan(search.site.url('/'), {
        ruleIds: ['search-spelling-variants'],
        policy: policyFor(search.site),
      })
      const result = report.rules.find((rule) => rule.id === 'search-spelling-variants')
      expect(result?.status).toBe('fail')
      expect(report.facts.searchTest?.lost).toBeGreaterThan(0)
      expect(report.facts.searchTest?.words[0]?.word).toBe('مكتبة')
      expect(search.requests.length).toBeLessThanOrEqual(MAX_SEARCH_REQUESTS)
      search.requests.length = 0
      const whole = await scan(search.site.url('/'), { policy: policyFor(search.site) })
      expect(whole.rules.some((rule) => rule.id === 'search-spelling-variants')).toBe(false)
      expect(search.requests).toEqual([])
    } finally {
      await search.site.close()
    }
  }, 40_000)
})

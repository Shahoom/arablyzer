// The staging runbook's HTTP checks (docs/deploy/staging.md, §9 C to I), asked of a URL as a
// visitor asks: pages, 404s, redirects, headers, robots.txt, sitemaps, images and the API's refusals.
// They start no scan and change nothing: the one POST has no Turnstile token, and is refused.
// `infra/smoke.ts` runs them; infra/checks/smoke.test.ts runs them against answers made up.

export interface SmokeOptions {
  /** The site's address as visitors reach it, e.g. https://staging.arablyzer.com */
  site: URL
  /** Extra request headers, such as Cloudflare Access's service token. */
  headers?: Record<string, string>
  /** A stand-in for `fetch`, for the unit test. */
  fetch?: typeof fetch
  /** Per-request time limit in milliseconds. */
  timeoutMs?: number
}

export interface SmokeResult {
  name: string
  /** Empty: the check passed. */
  problems: string[]
  /** A warning does not fail the run. */
  level: 'fail' | 'warn'
}

type Ask = (path: string, init?: RequestInit) => Promise<Response>

// Pages that must answer 200 in both languages, and the language each declares.
export const PAGES: readonly { path: string; lang: string; dir?: string }[] = [
  { path: '/', lang: 'ar', dir: 'rtl' },
  { path: '/en/', lang: 'en', dir: 'ltr' },
  { path: '/tools', lang: 'ar' },
  { path: '/en/tools', lang: 'en' },
  { path: '/tools/rtl-check', lang: 'ar' },
  { path: '/en/tools/rtl-check', lang: 'en' },
  { path: '/rules', lang: 'ar' },
  { path: '/en/rules', lang: 'en' },
  { path: '/fix', lang: 'ar' },
  { path: '/glossary', lang: 'ar' },
  { path: '/methodology', lang: 'ar' },
  { path: '/bot', lang: 'ar' },
]

const SECURITY_HEADERS: readonly [string, RegExp][] = [
  ['strict-transport-security', /max-age=([1-9]\d*)/],
  ['x-content-type-options', /^nosniff$/i],
  ['x-frame-options', /^DENY$/i],
  ['content-security-policy', /frame-ancestors 'none'/],
  ['referrer-policy', /\S/],
  ['cross-origin-opener-policy', /^same-origin$/],
  ['permissions-policy', /\S/],
]

// A report id that no scan has: 22 characters of the id alphabet.
const NO_SUCH_REPORT = 'AbCdEfGhIjKlMnOpQrSt_-'

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const cause =
    error instanceof Error && error.cause instanceof Error ? `: ${error.cause.message}` : ''
  return `${message.split('\n')[0] ?? message}${cause}`
}

async function check(
  name: string,
  level: SmokeResult['level'],
  run: () => Promise<string[]>,
): Promise<SmokeResult> {
  try {
    return { name, level, problems: await run() }
  } catch (error) {
    return { name, level, problems: [`could not be asked: ${describe(error)}`] }
  }
}

function headerProblems(response: Response, label: string): string[] {
  const problems: string[] = []
  for (const [name, pattern] of SECURITY_HEADERS) {
    const value = response.headers.get(name)
    if (value === null) problems.push(`${label}: no ${name}`)
    else if (!pattern.test(value)) problems.push(`${label}: ${name} is "${value}"`)
  }
  // Cloudflare adds its own `server: cloudflare`; anything else is the origin's to hide.
  const server = response.headers.get('server')
  if (server !== null && server.toLowerCase() !== 'cloudflare') {
    problems.push(`${label}: Server says "${server}"`)
  }
  return problems
}

/** Runs every check, in order, and returns what each found. */
export async function runSmoke(options: SmokeOptions): Promise<SmokeResult[]> {
  const doFetch = options.fetch ?? fetch
  const origin = options.site.origin
  const ask: Ask = (path, init = {}) =>
    doFetch(new URL(path, origin), {
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
      ...init,
      headers: { 'user-agent': 'arablyzer-smoke', ...options.headers, ...(init.headers as object) },
    })

  const results: SmokeResult[] = []
  const run = async (
    name: string,
    body: () => Promise<string[]>,
    level: 'fail' | 'warn' = 'fail',
  ) => {
    results.push(await check(name, level, body))
  }

  // Not behind a login or a refusal: the first thing a wrong Access policy or origin shows.
  await run('the home page answers, in Arabic, right to left', async () => {
    const response = await ask('/')
    if (response.status !== 200) return [`/ answers ${response.status}, not 200`]
    const html = await response.text()
    return /<html[^>]*\blang="ar"/.test(html)
      ? []
      : ['/ is not lang="ar": a login or another site?']
  })

  await run('the pages, in both languages', async () => {
    const problems: string[] = []
    for (const page of PAGES) {
      const response = await ask(page.path)
      if (response.status !== 200) {
        problems.push(`${page.path} answers ${response.status}`)
        continue
      }
      const html = await response.text()
      if (!new RegExp(`<html[^>]*\\blang="${page.lang}"`).test(html)) {
        problems.push(`${page.path} is not lang="${page.lang}"`)
      }
      if (page.dir !== undefined && !new RegExp(`<html[^>]*\\bdir="${page.dir}"`).test(html)) {
        problems.push(`${page.path} is not dir="${page.dir}"`)
      }
    }
    return problems
  })

  await run('security headers, on a page and on a 404', async () => [
    ...headerProblems(await ask('/'), '/'),
    ...headerProblems(await ask('/no-such-page'), '/no-such-page'),
  ])

  await run('an address with no page is a 404, never indexed', async () => {
    const problems: string[] = []
    for (const path of ['/no-such-page', '/en/no-such-page']) {
      const response = await ask(path)
      if (response.status !== 404) problems.push(`${path} answers ${response.status}, not 404`)
      const robots = response.headers.get('x-robots-tag') ?? ''
      if (!/noindex/i.test(robots)) problems.push(`${path}: X-Robots-Tag is "${robots}"`)
    }
    return problems
  })

  await run('a trailing slash goes to the page, 308', async () => {
    const response = await ask('/tools/rtl-check/?a=b')
    const location = response.headers.get('location') ?? ''
    if (response.status !== 308) return [`answers ${response.status}, not 308`]
    return location.endsWith('/tools/rtl-check?a=b') ? [] : [`goes to "${location}"`]
  })

  await run('robots.txt keeps the API out and names the sitemap', async () => {
    const response = await ask('/robots.txt')
    if (response.status !== 200) return [`answers ${response.status}`]
    const text = await response.text()
    const problems: string[] = []
    if (!/^Disallow:\s*\/api\//m.test(text)) problems.push('no "Disallow: /api/"')
    if (!text.includes(`Sitemap: ${origin}/sitemap`)) problems.push(`no Sitemap line on ${origin}`)
    return problems
  })

  await run('every sitemap is XML, and every address in it is on this site', async () => {
    const index = await ask('/sitemap.xml')
    if (index.status !== 200) return [`/sitemap.xml answers ${index.status}`]
    const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1] ?? '')
    const problems: string[] = []
    const maps = locs(await index.text())
    if (maps.length === 0) problems.push('/sitemap.xml names no sitemap')
    for (const map of maps) {
      if (!map.startsWith(origin)) {
        problems.push(`${map} is not on ${origin}`)
        continue
      }
      const response = await ask(map.slice(origin.length))
      const type = response.headers.get('content-type') ?? ''
      if (response.status !== 200 || !type.includes('xml')) {
        problems.push(`${map} answers ${response.status} ${type}`)
        continue
      }
      const off = locs(await response.text()).filter((loc) => !loc.startsWith(origin))
      if (off.length > 0)
        problems.push(`${map} has ${off.length} address(es) off the site, e.g. ${off[0]}`)
    }
    return problems
  })

  await run("a page's image", async () => {
    const response = await ask('/og/tools/rtl-check.png')
    const type = response.headers.get('content-type') ?? ''
    return response.status === 200 && type.startsWith('image/png')
      ? []
      : [`answers ${response.status} ${type}`]
  })

  await run(
    'a report that does not exist: 404 from the API, and its page never indexed',
    async () => {
      const problems: string[] = []
      const api = await ask(`/api/reports/${NO_SUCH_REPORT}`)
      if (api.status !== 404) problems.push(`the API answers ${api.status}, not 404`)
      for (const path of [`/r/${NO_SUCH_REPORT}`, `/en/r/${NO_SUCH_REPORT}`]) {
        const page = await ask(path)
        if (!/noindex/i.test(page.headers.get('x-robots-tag') ?? '')) {
          problems.push(`${path}: no X-Robots-Tag noindex`)
        }
      }
      return problems
    },
  )

  await run('the scan API is there, and refuses a request without Turnstile', async () => {
    const response = await ask('/api/scans', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ url: 'https://example.com/' }),
    })
    // 4xx: reached, and refused (no token, bad request, or a limit). 5xx: the API is down; 2xx: the gate is open.
    if (response.status >= 500) return [`answers ${response.status}: the API is not answering`]
    if (response.status >= 200 && response.status < 300) {
      return ['a scan started without a Turnstile token: the gate is open']
    }
    return response.status >= 400 ? [] : [`answers ${response.status}`]
  })

  await run('the API refuses a request that comes from another site', async () => {
    const response = await ask('/api/scans', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: '{}',
    })
    return response.status >= 400 && response.status < 500
      ? []
      : [`answers ${response.status}, not a 4xx refusal`]
  })

  if (options.site.protocol === 'https:') {
    await run(
      'plain HTTP goes to HTTPS',
      async () => {
        const plain = new URL('/', options.site)
        plain.protocol = 'http:'
        const response = await doFetch(plain, {
          redirect: 'manual',
          signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
          headers: { 'user-agent': 'arablyzer-smoke', ...options.headers },
        })
        const location = response.headers.get('location') ?? ''
        return response.status >= 300 && response.status < 400 && location.startsWith('https://')
          ? []
          : [
              `http:// answers ${response.status} ${location}: turn on "Always Use HTTPS" in Cloudflare`,
            ]
      },
      'warn',
    )
  }

  return results
}

/** One line per check, in the form of `pnpm verify:deploy`; the exit code is 1 if one failed. */
export function formatSmoke(results: readonly SmokeResult[]): { text: string; failed: number } {
  const lines: string[] = []
  let failed = 0
  let warned = 0
  for (const result of results) {
    if (result.problems.length === 0) {
      lines.push(`  ok    ${result.name}`)
      continue
    }
    if (result.level === 'warn') warned++
    else failed++
    lines.push(`  ${result.level === 'warn' ? 'warn' : 'FAIL'}  ${result.name}`)
    for (const problem of result.problems) lines.push(`          - ${problem}`)
  }
  const ok = results.length - failed - warned
  lines.push(
    `${results.length} checks: ${ok} ok, ${warned} warning${warned === 1 ? '' : 's'}, ${failed} failed`,
  )
  return { text: lines.join('\n'), failed }
}

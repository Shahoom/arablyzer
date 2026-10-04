import { SCAN_ID_PATTERN } from '@arablyzer/api-contract/codes'
import { subsetFont, MAX_SUBSET_INPUT } from '@arablyzer/collectors'
import { safeFetch, type EgressPolicy, type Resolver } from '@arablyzer/egress'
import { USER_AGENT } from '@arablyzer/engine/identity'
import type { Window } from '@arablyzer/plans'
import type { RateLimiter, ScanStore } from '@arablyzer/store'
import type { Context, Hono } from 'hono'

/** What the font route uses of the API's own dependencies. */
export interface FontContext {
  readonly store: ScanStore
  readonly limiter: RateLimiter
  readonly window: Window
  readonly policy: EgressPolicy
  readonly resolver: Resolver
  readonly address: (c: Context) => string | null
  readonly connectionKey: (address: string, now: Date) => string
  readonly now: () => Date
  /** Another way to fetch; tests pass their own. */
  readonly fetcher?: typeof safeFetch
}

const TIMEOUT_MS = 15_000
/** A font name for a file name: ASCII letters, digits and dashes. */
const slug = (family: string): string =>
  family
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'arabic-font'

/**
 * The subset of one of a report's Arabic fonts, made on request (docs/design/plans/arabic-native.md
 * §1): `GET /api/reports/:id/font-subset?font=<the font's address in the report>`. The font is
 * fetched by the address the report holds, through the egress rules, within 5 MB and 15 s, cut to
 * the characters the report recorded for it, and sent as WOFF2. Only an address the report lists
 * is fetched, so the route is no way to fetch another; nothing is stored, and the response is not
 * cached.
 */
export function registerFontRoutes(app: Hono, context: FontContext): void {
  app.get('/api/reports/:id/font-subset', async (c) => {
    const id = c.req.param('id')
    const font = c.req.query('font') ?? ''
    if (!SCAN_ID_PATTERN.test(id) || font === '' || font.length > 2048) {
      return c.json({ error: 'bad-request' }, 400)
    }
    const address = context.address(c)
    if (address === null) return c.json({ error: 'unavailable' }, 503)
    const at = context.now()
    const taken = await context.limiter.take(
      `font:${context.connectionKey(address, at)}`,
      context.window,
      at.getTime(),
    )
    if (!taken.ok) return c.json({ error: 'rate-limited' }, 429)
    const scan = await context.store.get(id)
    const listed = scan?.report?.facts.arabicFonts?.fonts.find((entry) => entry.url === font)
    if (listed === undefined) return c.notFound()
    const fetched = await (context.fetcher ?? safeFetch)(listed.url, {
      userAgent: USER_AGENT,
      accept: 'font/woff2,font/woff,font/ttf,font/otf,*/*;q=0.5',
      policy: context.policy,
      resolver: context.resolver,
      timeoutMs: TIMEOUT_MS,
      maxBytes: MAX_SUBSET_INPUT,
    }).catch(() => null)
    const response = fetched?.response
    if (response?.status !== 200) {
      return c.json({ error: 'font-unavailable' }, 502)
    }
    let subset: Uint8Array
    try {
      subset = (await subsetFont(response.body, listed.characters)).woff2
    } catch {
      return c.json({ error: 'font-unreadable' }, 422)
    }
    c.header('content-type', 'font/woff2')
    c.header('content-disposition', `attachment; filename="${slug(listed.family)}-subset.woff2"`)
    c.header('cache-control', 'no-store')
    return c.body(subset as Uint8Array<ArrayBuffer>)
  })
}

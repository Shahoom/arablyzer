import { constants, createGunzip } from 'node:zlib'
import {
  collectSitemap,
  SITEMAP_LIMIT,
  SITEMAP_MAX_ATTRIBUTES,
  SITEMAP_MAX_DEPTH,
  sitemapTargets,
  type RobotsFacts,
  type SitemapCheck,
  type SitemapFacts,
} from '@arablyzer/collectors'
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_REDIRECTS,
  safeFetch,
  type SafeFetchOptions,
} from '@arablyzer/egress'
import { challengeOf } from '@arablyzer/rules'

export { SITEMAP_LIMIT, SITEMAP_MAX_ATTRIBUTES, SITEMAP_MAX_DEPTH }

/**
 * How long a scan's sitemap fetches may wait on the network together, the robots.txt of another
 * site among them (M2.3c review). Reading a file and parsing it are not waiting: they are bounded
 * by the size of the file (SITEMAP_MAX_BYTES) and by the reader's limits, not by this. The
 * sitemaps are fetched after the render, so they cannot shorten it.
 */
export const SITEMAP_TIMEOUT_MS = 10_000

/** Time to wait on the network, spent as work waits (see networkBudget). */
export interface NetworkBudget {
  /** Milliseconds not yet spent; negative once overspent. */
  left(): number
  /**
   * Runs work that waits on the network, with a signal that ends when what is left is spent (or
   * when the scan's own signal does). The time it takes comes off the budget, work that fails
   * included; time between such work does not.
   */
  during<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T>
}

export function networkBudget(
  ms: number,
  now: () => number = () => performance.now(),
  outer?: AbortSignal,
): NetworkBudget {
  let left = ms
  return {
    left: () => left,
    during: async (work) => {
      const started = now()
      const spent = AbortSignal.timeout(Math.max(1, Math.ceil(left)))
      try {
        return await work(outer === undefined ? spent : AbortSignal.any([spent, outer]))
      } finally {
        left -= now() - started
      }
    },
  }
}

/**
 * What a scan reads of each sitemap, decompressed: the scan's limit for a file (BUILD-PLAN §11).
 * The protocol allows 50 MB; a larger sitemap is judged in its first part.
 */
export const SITEMAP_MAX_BYTES = DEFAULT_MAX_BYTES

/** The redirects the fetch of a sitemap follows: the scan's own limit for a page (BUILD-PLAN §11). */
export const SITEMAP_MAX_REDIRECTS = DEFAULT_MAX_REDIRECTS

const SITEMAP_ACCEPT = 'application/xml,text/xml;q=0.9,*/*;q=0.8'

/**
 * The sitemaps as a scan read them; or that robots.txt could not be read, which leaves it unknown
 * which sitemaps the site names, and the rules that read them nothing to judge.
 */
export type SitemapRead = { readonly facts: SitemapFacts } | { readonly failed: 'robots' }

export interface SitemapContext {
  /** The page's fetch options, with the lockdown its chain ended with. */
  readonly base: SafeFetchOptions
  /**
   * The time the sitemaps may wait on the network, for them all: SITEMAP_TIMEOUT_MS by default;
   * less when the scan has less left.
   */
  readonly budgetMs?: number
  /**
   * Whether the URL's site lets the bot fetch it: its robots.txt, read once per site, asks
   * nothing else of ArablyzerBot there (M2.4 plan §2). `privateAccess`, as a fetch's hop says.
   */
  readonly allowed: (url: string, privateAccess: boolean, signal: AbortSignal) => Promise<boolean>
  /** Whether the page's fetch still had private access, as FetchResult.privateAccess says. */
  readonly privateAccess: boolean
}

/**
 * The site's sitemaps (M2.3c): the first SITEMAP_LIMIT that robots.txt names as full URLs, or
 * /sitemap.xml at the page's origin when it names none; nothing else, the sitemaps an index lists
 * included. Each goes through the egress package, waiting on the network for SITEMAP_TIMEOUT_MS at
 * most for them all, and is read up to SITEMAP_MAX_BYTES, decompressed when the file is gzipped. Each has an outcome of its
 * own: one that could not be checked, for a reason that is not the site's answer (no answer in
 * time, an address the policy refuses, a robots.txt that keeps the bot from it, a bot challenge,
 * or a status by which the site turns the scan away), is a `failed` check with its reason, and the
 * rules judge the others.
 */
export async function fetchSitemaps(
  robots: RobotsFacts,
  origin: string,
  context: SitemapContext,
): Promise<SitemapRead> {
  // Unread, robots.txt may name any sitemap; missing (4xx), it names none.
  if (robots.outcome === 'failed' || robots.outcome === 'unreachable') return { failed: 'robots' }
  const named = robots.outcome === 'fetched' ? robots.robots.sitemaps : []
  const { fetch, unchecked } = sitemapTargets(named, origin, SITEMAP_LIMIT)
  const budget = networkBudget(
    context.budgetMs ?? SITEMAP_TIMEOUT_MS,
    () => performance.now(),
    context.base.signal,
  )
  const checked: SitemapCheck[] = []
  for (const target of fetch) checked.push(await fetchSitemap(target, budget, context))
  return { facts: { named, checked, unchecked } }
}

async function fetchSitemap(
  target: { readonly url: string; readonly named: boolean },
  budget: NetworkBudget,
  context: SitemapContext,
): Promise<SitemapCheck> {
  const { url, named } = target
  const failed = (code: string): SitemapCheck => ({ outcome: 'failed', url, named, code })
  // Out of time on the network: the sitemaps still to come are not asked for.
  if (budget.left() <= 0) return failed('timeout')
  // What waits on the network: the robots.txt of the sitemap's site, the file, the redirects on its
  // way. Reading the file and judging it, below, does not.
  const fetched = await budget.during(async (signal) => {
    // A site that keeps ArablyzerBot from its sitemap is not asked for it.
    if (!(await context.allowed(url, context.privateAccess, signal))) return null
    return safeFetch(url, {
      ...context.base,
      signal,
      timeoutMs: Math.min(context.base.timeoutMs ?? SITEMAP_TIMEOUT_MS, SITEMAP_TIMEOUT_MS),
      accept: SITEMAP_ACCEPT,
      maxBytes: SITEMAP_MAX_BYTES,
      maxRedirects: SITEMAP_MAX_REDIRECTS,
      onTooLarge: 'truncate',
      // Nor is it followed to a site that keeps the bot from where it leads.
      beforeRedirect: (to, hop) => context.allowed(to, hop.privateAccess, hop.signal),
    })
  })
  if (fetched === null) return failed('opted-out')
  const response = fetched.response
  // No answer, or a redirect the next site's robots.txt declined.
  if (response === null) return failed(fetched.error?.code ?? 'opted-out')
  // A bot challenge in place of the sitemap says nothing of it; the scan never gets past one.
  if (challengeOf(response.headers) !== null) return failed('bot-challenge')
  const { status } = response
  // A file that answered with an error has no sitemap to decompress.
  const succeeded = status >= 200 && status <= 299
  const read =
    succeeded && isGzip(response.body)
      ? await gunzip(response.body, response.truncated)
      : { body: response.body, truncated: response.truncated }
  // A gzip file that will not decompress is the site's fault: Search Console's compression error.
  return collectSitemap({
    url,
    named,
    status,
    body: read === null ? null : read.body,
    truncated: read === null ? false : read.truncated,
  })
}

/** A gzip file's first bytes (RFC 1952): a `sitemap.xml.gz` served as it is. */
export function isGzip(body: Uint8Array): boolean {
  return body[0] === 0x1f && body[1] === 0x8b
}

/**
 * A gzipped file, decompressed up to SITEMAP_MAX_BYTES and no further, so a small file cannot
 * grow past the limit; a file cut at the read limit is decompressed as far as it goes. Null when
 * it is not gzip after all.
 */
export async function gunzip(
  bytes: Uint8Array,
  truncated: boolean,
): Promise<{ body: Uint8Array; truncated: boolean } | null> {
  const stream = createGunzip(truncated ? { finishFlush: constants.Z_SYNC_FLUSH } : {})
  const chunks: Buffer[] = []
  let size = 0
  try {
    stream.end(bytes)
    for await (const chunk of stream) {
      const buffer = chunk as Buffer
      if (size + buffer.length > SITEMAP_MAX_BYTES) {
        chunks.push(buffer.subarray(0, SITEMAP_MAX_BYTES - size))
        return { body: Buffer.concat(chunks), truncated: true }
      }
      chunks.push(buffer)
      size += buffer.length
    }
    return { body: Buffer.concat(chunks), truncated }
  } catch {
    return null
  } finally {
    stream.destroy()
  }
}

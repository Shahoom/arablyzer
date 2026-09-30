import { z } from 'zod'
import { CruxData } from './crux'

const HeaderValue = z.union([z.string(), z.array(z.string()).min(1)])

export const RouteOverride = z.strictObject({
  /** Up to 999, as Node sends: some sites answer bots with statuses HTTP does not define. */
  status: z.number().int().min(100).max(999).optional(),
  headers: z.record(z.string().min(1), HeaderValue).optional(),
  /** Inline body; without it the file at the same path is served (or an empty body). */
  body: z.string().optional(),
  /** Sent gzipped, with Content-Encoding, to a client that accepts gzip. */
  compress: z.literal('gzip').optional(),
  /** The status a HEAD request gets instead, as a server that does not take HEAD answers (405). */
  headStatus: z.number().int().min(100).max(999).optional(),
  /**
   * What a HEAD request gets instead of any answer: `reset`, the connection closed at once, as a
   * server or firewall that drops HEAD does; or `silence`, no answer ever, as one that holds it.
   */
  headDrop: z.enum(['reset', 'silence']).optional(),
})
export type RouteOverride = z.infer<typeof RouteOverride>

/** A reserved .example name (RFC 2606), which real DNS never answers. */
const EXAMPLE_NAME = /^(?:[a-z0-9-]+\.)+example$/
/** A DNS name under .example, which may have labels such as `_dmarc`. */
const EXAMPLE_DNS_NAME = /^(?:[a-z0-9_-]+\.)+example$/

/**
 * site.json: how a site is served. `host` is the name it is scanned under, which tests map to
 * 127.0.0.1: a reserved .example name, so a site can look public without any request leaving the
 * machine. `aliases` are other names the same server answers to, in its certificate too, so a
 * page can redirect from one name to another, as example.com does to www.example.com (M2.3a).
 * `tls` serves it over HTTPS with a certificate from the test authority, this many days long
 * with this many left. `txt` is what DNS answers for its names' TXT records (fixtureTxt).
 */
export const SiteConfig = z
  .strictObject({
    /** What the CrUX stand-in answers for the site (see serveCrux): the CrUX rules' fixtures. */
    crux: CruxData.optional(),
    host: z.string().regex(EXAMPLE_NAME).optional(),
    aliases: z.array(z.string().regex(EXAMPLE_NAME)).min(1).optional(),
    tls: z
      .strictObject({
        lifetimeDays: z.number().positive().max(3650),
        daysLeft: z.number().min(-3650).max(3650),
      })
      .optional(),
    /** TXT records by name, each record one string (M2.3c's DNS rules); a name left out has none. */
    txt: z.record(z.string().regex(EXAMPLE_DNS_NAME), z.array(z.string())).optional(),
  })
  .refine(
    (site) =>
      site.aliases === undefined ||
      (site.host !== undefined &&
        !site.aliases.includes(site.host) &&
        new Set(site.aliases).size === site.aliases.length),
    { message: 'aliases need a host, and each names another host once', path: ['aliases'] },
  )
export type SiteConfig = z.infer<typeof SiteConfig>

/**
 * fixture.json: per-path overrides of status, headers and body (docs/design/phase-0.md §1). A key
 * is a path, the same on every name of the site, or //name/path for one of its aliases alone,
 * which takes the path's place there.
 */
export const FixtureConfig = z.record(
  z.string().regex(/^(?:\/\/(?:[a-z0-9-]+\.)+example)?\/\S*$/),
  RouteOverride,
)
export type FixtureConfig = z.infer<typeof FixtureConfig>

/** The key of a path's route on one name of a site: //name/path, which a plain path stands in for. */
export function routeKey(name: string, pathname: string): string {
  return `//${name}${pathname}`
}

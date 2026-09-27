import { z } from 'zod'

const HeaderValue = z.union([z.string(), z.array(z.string()).min(1)])

export const RouteOverride = z.strictObject({
  /** Up to 999, as Node sends: some sites answer bots with statuses HTTP does not define. */
  status: z.number().int().min(100).max(999).optional(),
  headers: z.record(z.string().min(1), HeaderValue).optional(),
  /** Inline body; without it the file at the same path is served (or an empty body). */
  body: z.string().optional(),
  /** Sent gzipped, with Content-Encoding, to a client that accepts gzip. */
  compress: z.literal('gzip').optional(),
})
export type RouteOverride = z.infer<typeof RouteOverride>

/**
 * site.json: how a site is served. `host` is the name it is scanned under, which tests map to
 * 127.0.0.1: a reserved .example name (RFC 2606), which real DNS never answers, so a site can
 * look public without any request leaving the machine. `tls` serves it over HTTPS with a
 * certificate from the test authority, this many days long with this many left.
 */
export const SiteConfig = z.strictObject({
  host: z
    .string()
    .regex(/^(?:[a-z0-9-]+\.)+example$/)
    .optional(),
  tls: z
    .strictObject({
      lifetimeDays: z.number().positive().max(3650),
      daysLeft: z.number().min(-3650).max(3650),
    })
    .optional(),
})
export type SiteConfig = z.infer<typeof SiteConfig>

/** fixture.json: per-path overrides of status, headers and body (docs/design/phase-0.md §1). */
export const FixtureConfig = z.record(z.string().regex(/^\/\S*$/), RouteOverride)
export type FixtureConfig = z.infer<typeof FixtureConfig>

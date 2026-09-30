import { z } from 'zod'

const HeaderValue = z.union([z.string(), z.array(z.string()).min(1)])

export const RouteOverride = z.strictObject({
  status: z.number().int().min(100).max(599).optional(),
  headers: z.record(z.string().min(1), HeaderValue).optional(),
  /** Inline body; without it the file at the same path is served (or an empty body). */
  body: z.string().optional(),
})
export type RouteOverride = z.infer<typeof RouteOverride>

/** fixture.json: per-path overrides of status, headers and body (docs/design/phase-0.md §1). */
export const FixtureConfig = z.record(z.string().regex(/^\/\S*$/), RouteOverride)
export type FixtureConfig = z.infer<typeof FixtureConfig>

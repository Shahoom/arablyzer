import http from 'node:http'
import { z } from 'zod'

/** The 75th percentiles a site's CrUX data holds: milliseconds, and CLS without a unit. */
export const CruxMetrics = z.strictObject({
  lcp: z.number().int().nonnegative().optional(),
  inp: z.number().int().nonnegative().optional(),
  cls: z.number().nonnegative().optional(),
})
export type CruxMetrics = z.infer<typeof CruxMetrics>

/**
 * What the stand-in answers: data for the page's URL and for its origin; none makes it answer
 * 404, as the API does, and a number answers with that status.
 */
export const CruxData = z.strictObject({
  url: z.union([CruxMetrics, z.number().int().min(400).max(599)]).optional(),
  origin: z.union([CruxMetrics, z.number().int().min(400).max(599)]).optional(),
})
export type CruxData = z.infer<typeof CruxData>

export interface CruxQuery {
  readonly url?: string
  readonly origin?: string
  readonly formFactor?: string
  /** The X-Goog-Api-Key header as it came. */
  readonly key: string | null
}

export interface CruxStandIn {
  /** The records:queryRecord endpoint to give the engine. */
  readonly endpoint: string
  readonly port: number
  /** The queries it was asked, in order. */
  readonly queries: readonly CruxQuery[]
  close(): Promise<void>
}

/** The 28 days every answer covers, so reports stay the same from one run to the next. */
const PERIOD = {
  firstDate: { year: 2026, month: 8, day: 30 },
  lastDate: { year: 2026, month: 9, day: 26 },
}

/**
 * The API's answer to one query, from `data`: the pure part of the stand-in, which tests of rules
 * use without a server. `query` is the request's JSON body; `key`, its X-Goog-Api-Key.
 */
export function answerCrux(
  data: CruxData,
  query: Readonly<Record<string, unknown>>,
  key: string | null,
): { readonly status: number; readonly body: unknown } {
  const error = (status: number) => ({
    status,
    body: { error: { code: status, message: 'stand-in error', status: 'ERROR' } },
  })
  if (key === null || key === '') return error(403)
  const text = (value: unknown) => (typeof value === 'string' ? value : undefined)
  const url = text(query.url)
  const origin = text(query.origin)
  const scope = url !== undefined ? 'url' : origin !== undefined ? 'origin' : null
  const answer = scope === null ? undefined : data[scope]
  if (scope === null || answer === undefined) {
    return {
      status: 404,
      body: {
        error: { code: 404, message: 'chrome ux report data not found', status: 'NOT_FOUND' },
      },
    }
  }
  if (typeof answer === 'number') return error(answer)
  const metric = (p75: number | string | undefined) =>
    p75 === undefined ? {} : { percentiles: { p75 }, histogram: [] }
  return {
    status: 200,
    body: {
      record: {
        key: { formFactor: text(query.formFactor), [scope]: scope === 'url' ? url : origin },
        metrics: {
          ...(answer.lcp === undefined ? {} : { largest_contentful_paint: metric(answer.lcp) }),
          ...(answer.inp === undefined ? {} : { interaction_to_next_paint: metric(answer.inp) }),
          // The API gives CLS's percentile as a string.
          ...(answer.cls === undefined
            ? {}
            : { cumulative_layout_shift: metric(answer.cls.toFixed(2)) }),
        },
        collectionPeriod: PERIOD,
      },
    },
  }
}

/**
 * A local stand-in for the Chrome UX Report API: it answers records:queryRecord as the API does,
 * from `data` (answerCrux), so the engine and the CrUX rules are tested without a key or the
 * network.
 */
export async function serveCrux(
  data: CruxData,
  { port = 0 }: { port?: number } = {},
): Promise<CruxStandIn> {
  const queries: CruxQuery[] = []
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size <= 64 * 1024) chunks.push(chunk)
    })
    req.on('end', () => {
      let query: Record<string, unknown> = {}
      try {
        const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (typeof parsed === 'object' && parsed !== null) query = parsed as Record<string, unknown>
      } catch {
        // An empty query: answered as the API answers one.
      }
      const header = req.headers['x-goog-api-key']
      const key = typeof header === 'string' ? header : null
      const text = (value: unknown) => (typeof value === 'string' ? value : undefined)
      const url = text(query.url)
      const origin = text(query.origin)
      const formFactor = text(query.formFactor)
      queries.push({
        ...(url === undefined ? {} : { url }),
        ...(origin === undefined ? {} : { origin }),
        ...(formFactor === undefined ? {} : { formFactor }),
        key,
      })
      const answer =
        req.method === 'POST'
          ? answerCrux(data, query, key)
          : { status: 405, body: { error: { code: 405 } } }
      res.writeHead(answer.status, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(answer.body))
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('The stand-in has no port')
  return {
    endpoint: `http://127.0.0.1:${address.port}/v1/records:queryRecord`,
    port: address.port,
    queries,
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

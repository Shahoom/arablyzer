import http from 'node:http'
import { z } from 'zod'

/**
 * What the Safe Browsing stand-in answers for a site: the threat types Google lists its page
 * under (none: the empty answer a clean page gets), or an error status.
 */
export const SafeBrowsingData = z.strictObject({
  threats: z
    .array(
      z.enum([
        'MALWARE',
        'SOCIAL_ENGINEERING',
        'UNWANTED_SOFTWARE',
        'POTENTIALLY_HARMFUL_APPLICATION',
      ]),
    )
    .optional(),
  error: z.number().int().min(400).max(599).optional(),
})
export type SafeBrowsingData = z.infer<typeof SafeBrowsingData>

export interface SafeBrowsingQuery {
  /** The URLs it was asked about, in order. */
  readonly urls: readonly string[]
  /** The X-Goog-Api-Key header as it came. */
  readonly key: string | null
}

export interface SafeBrowsingStandIn {
  /** The threatMatches:find endpoint to give the engine. */
  readonly endpoint: string
  readonly port: number
  readonly queries: readonly SafeBrowsingQuery[]
  close(): Promise<void>
}

/** The API's answer to one query, from `data`: the pure part of the stand-in. */
export function answerSafeBrowsing(
  data: SafeBrowsingData,
  query: Readonly<Record<string, unknown>>,
  key: string | null,
): { readonly status: number; readonly body: unknown } {
  const error = (status: number) => ({
    status,
    body: { error: { code: status, message: 'stand-in error', status: 'ERROR' } },
  })
  if (key === null || key === '') return error(403)
  if (data.error !== undefined) return error(data.error)
  const urls = urlsOf(query)
  if ((data.threats ?? []).length === 0 || urls[0] === undefined) return { status: 200, body: {} }
  return {
    status: 200,
    body: {
      matches: (data.threats ?? []).map((threatType) => ({
        threatType,
        platformType: 'ANY_PLATFORM',
        threatEntryType: 'URL',
        threat: { url: urls[0] },
        cacheDuration: '300s',
      })),
    },
  }
}

function urlsOf(query: Readonly<Record<string, unknown>>): string[] {
  const info = query.threatInfo
  const entries =
    typeof info === 'object' && info !== null
      ? (info as { threatEntries?: unknown }).threatEntries
      : []
  if (!Array.isArray(entries)) return []
  return entries.flatMap((entry: unknown) => {
    const url =
      typeof entry === 'object' && entry !== null ? (entry as { url?: unknown }).url : null
    return typeof url === 'string' ? [url] : []
  })
}

/**
 * A local stand-in for Safe Browsing's Lookup API: it answers threatMatches:find as the API does,
 * from `data`, so the engine and its rule are tested without a key or the network.
 */
export async function serveSafeBrowsing(
  data: SafeBrowsingData,
  { port = 0 }: { port?: number } = {},
): Promise<SafeBrowsingStandIn> {
  const queries: SafeBrowsingQuery[] = []
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
      queries.push({ urls: urlsOf(query), key })
      const answer =
        req.method === 'POST'
          ? answerSafeBrowsing(data, query, key)
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
    endpoint: `http://127.0.0.1:${address.port}/v4/threatMatches:find`,
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

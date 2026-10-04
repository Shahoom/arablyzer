import http from 'node:http'
import { z } from 'zod'

const Entity = z.strictObject({
  name: z.string(),
  types: z.array(z.string()).optional(),
  description: z.string().optional(),
  wikipedia: z.string().optional(),
})

/** What the Knowledge Graph stand-in answers for a site: entities by language, or an error status. */
export const KnowledgeGraphData = z.strictObject({
  ar: z.array(Entity).optional(),
  en: z.array(Entity).optional(),
  error: z.number().int().min(400).max(599).optional(),
})
export type KnowledgeGraphData = z.infer<typeof KnowledgeGraphData>

export interface KnowledgeGraphQuery {
  readonly query: string | null
  readonly languages: string | null
  /** The X-Goog-Api-Key header as it came. */
  readonly key: string | null
}

export interface KnowledgeGraphStandIn {
  readonly endpoint: string
  readonly port: number
  readonly queries: readonly KnowledgeGraphQuery[]
  close(): Promise<void>
}

/** The API's answer to one query, from `data`. */
export function answerKnowledgeGraph(
  data: KnowledgeGraphData,
  languages: string | null,
  key: string | null,
): { readonly status: number; readonly body: unknown } {
  const error = (status: number) => ({
    status,
    body: { error: { code: status, message: 'stand-in error', status: 'ERROR' } },
  })
  if (key === null || key === '') return error(403)
  if (data.error !== undefined) return error(data.error)
  const entities = (languages === 'ar' || languages === 'en' ? data[languages] : undefined) ?? []
  return {
    status: 200,
    body: {
      '@context': {},
      '@type': 'ItemList',
      itemListElement: entities.map((entity) => ({
        '@type': 'EntitySearchResult',
        result: {
          '@type': ['Thing', ...(entity.types ?? [])],
          name: entity.name,
          ...(entity.description === undefined ? {} : { description: entity.description }),
          ...(entity.wikipedia === undefined
            ? {}
            : { detailedDescription: { url: entity.wikipedia, articleBody: '…' } }),
        },
        resultScore: 100,
      })),
    },
  }
}

/** A local stand-in for entities:search, so the engine and its rule are tested without a key. */
export async function serveKnowledgeGraph(
  data: KnowledgeGraphData,
  { port = 0 }: { port?: number } = {},
): Promise<KnowledgeGraphStandIn> {
  const queries: KnowledgeGraphQuery[] = []
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://stand-in')
    const header = req.headers['x-goog-api-key']
    const key = typeof header === 'string' ? header : null
    queries.push({
      query: url.searchParams.get('query'),
      languages: url.searchParams.get('languages'),
      key,
    })
    const answer =
      req.method === 'GET'
        ? answerKnowledgeGraph(data, url.searchParams.get('languages'), key)
        : { status: 405, body: { error: { code: 405 } } }
    res.writeHead(answer.status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(answer.body))
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('The stand-in has no port')
  return {
    endpoint: `http://127.0.0.1:${address.port}/v1/entities:search`,
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

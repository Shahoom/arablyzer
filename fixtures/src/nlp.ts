import http from 'node:http'
import { z } from 'zod'

const Finding = z.strictObject({
  text: z.number().int().min(0).optional(),
  start: z.number().int().min(0).optional(),
  end: z.number().int().min(0).optional(),
  word: z.string(),
  suggestion: z.string(),
  family: z.enum(['hamza', 'ta-marbuta', 'alef-maqsura', 'tanween', 'typo', 'phrase']),
  confidence: z.number().min(0).max(1),
  before: z.string(),
  after: z.string(),
  alternatives: z.array(z.string()).default([]),
})

const Varieties = z.strictObject({
  msa: z.number(),
  gulf: z.number(),
  egyptian: z.number(),
  levantine: z.number(),
  maghrebi: z.number(),
})

/**
 * What the Arabic NLP service stand-in answers for a site: the bodies of /spell and /dialect as the
 * service gives them (services/arabic-nlp), or an error status for both. The golden pages' answers
 * are the real service's, recorded and checked against it by services/arabic-nlp/tools/check_golden.py.
 */
export const NlpData = z.strictObject({
  spelling: z
    .strictObject({
      min_confidence: z.number().min(0).max(1),
      words: z.number().int().min(0),
      judged: z.number().int().min(0),
      truncated: z.boolean(),
      findings: z.array(Finding),
    })
    .optional(),
  dialect: z
    .strictObject({
      model: z.string(),
      label: z.enum(['msa', 'gulf', 'egyptian', 'levantine', 'maghrebi']).nullable(),
      probabilities: Varieties,
      votes: z.strictObject({
        msa: z.number().int(),
        gulf: z.number().int(),
        egyptian: z.number().int(),
        levantine: z.number().int(),
        maghrebi: z.number().int(),
      }),
      chunks: z.number().int().min(0),
      words: z.number().int().min(0),
      truncated: z.boolean(),
    })
    .optional(),
  error: z.number().int().min(400).max(599).optional(),
})
export type NlpData = z.infer<typeof NlpData>

export interface NlpStandIn {
  /** The service's address, for ScanOptions.nlp.url. */
  readonly url: string
  readonly port: number
  /** The requests asked, in order: the path and the JSON body. */
  readonly asked: readonly { readonly path: string; readonly body: Record<string, unknown> }[]
  close(): Promise<void>
}

/** What a stand-in does with a request: answers, or never does (a service that hangs). */
export type NlpAnswer =
  { readonly status: number; readonly body: unknown } | { readonly hang: true }

/** A local stand-in for the Arabic NLP service whose answers a function gives, so that a test can make it fail. */
export async function serveNlpWith(
  answer: (path: string, body: Record<string, unknown>) => NlpAnswer,
  { port = 0 }: { port?: number } = {},
): Promise<NlpStandIn> {
  const asked: { path: string; body: Record<string, unknown> }[] = []
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      let body: Record<string, unknown> = {}
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
      } catch {
        // A body that is not JSON is asked as nothing.
      }
      const path = req.url ?? ''
      asked.push({ path, body })
      const given = answer(path, body)
      if ('hang' in given) return
      res.writeHead(given.status, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(given.body))
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('The stand-in has no port')
  return {
    url: `http://127.0.0.1:${address.port}`,
    port: address.port,
    asked,
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

/** What the real service says of a text it finds nothing in: no slips, no sentences read. */
const NO_SLIPS = { min_confidence: 0.9, words: 0, judged: 0, truncated: false, findings: [] }
const NONE = { msa: 0, gulf: 0, egyptian: 0, levantine: 0, maghrebi: 0 }
const NO_DIALECT = {
  model: 'camel-dialectid-model6',
  label: null,
  probabilities: NONE,
  votes: NONE,
  chunks: 0,
  words: 0,
  truncated: false,
}

/** A local stand-in for the Arabic NLP service, so a scan is tested without it. */
export function serveNlp(data: NlpData, options: { port?: number } = {}): Promise<NlpStandIn> {
  return serveNlpWith((path) => {
    if (data.error !== undefined) return { status: data.error, body: { error: 'stand-in error' } }
    if (path === '/spell') return { status: 200, body: data.spelling ?? NO_SLIPS }
    if (path === '/dialect') return { status: 200, body: data.dialect ?? NO_DIALECT }
    return { status: 404, body: { error: 'not-found' } }
  }, options)
}

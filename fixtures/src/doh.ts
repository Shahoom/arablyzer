import http from 'node:http'

/**
 * A stand-in for a DNS-over-HTTPS resolver (RFC 8484) on 127.0.0.1, for the tests of TXT lookups
 * (M2.3c review): GET /dns-query?dns=<query>, answered as application/dns-message. It answers TXT
 * questions from a zone, logs every question and request, and can fail in the ways a resolver
 * does: a status, a content type, a redirect, a message of the test's own, or silence. No test
 * asks a real resolver.
 */

/** What a zone holds for a name. */
export interface DohEntry {
  /** TXT records: one string, or the several strings one record holds (RFC 1035 §3.3.14). */
  readonly txt?: readonly (string | readonly string[])[]
  /** Answer with this RCODE and nothing else: 2 SERVFAIL, 5 REFUSED. */
  readonly rcode?: number
  /** Never answer. */
  readonly hang?: boolean
}

/** Names to entries; a name left out does not exist (NXDOMAIN). */
export type DohZone = Readonly<Record<string, DohEntry>> | ((name: string) => DohEntry | undefined)

export interface DohRequest {
  readonly method: string
  /** The path and query as they arrived. */
  readonly url: string
  readonly accept: string | undefined
  readonly userAgent: string | undefined
}

export interface DohFailure {
  /** Answer every request with this status and no DNS message. */
  readonly status?: number
  /** The answer's content type; application/dns-message by default. */
  readonly contentType?: string
  /** Answer every request with a redirect to this address. */
  readonly location?: string
  /** Send these bytes for every answer instead of the zone's. */
  readonly body?: Uint8Array
}

export interface DohStandIn {
  readonly port: number
  /** http://127.0.0.1:<port>/dns-query */
  readonly url: string
  /** Every question asked, as "name TYPE": "_dmarc.example.test TXT". */
  readonly questions: string[]
  readonly requests: DohRequest[]
  close(): Promise<void>
}

const PATH = '/dns-query'
const TYPE_TXT = 16
const TYPE_NAMES: Readonly<Record<number, string>> = { 1: 'A', 16: 'TXT', 28: 'AAAA' }

export async function serveDoh(zone: DohZone, failure: DohFailure = {}): Promise<DohStandIn> {
  const questions: string[] = []
  const requests: DohRequest[] = []
  const server = http.createServer((req, res) => {
    requests.push({
      method: req.method ?? '',
      url: req.url ?? '',
      accept: req.headers.accept,
      userAgent: req.headers['user-agent'],
    })
    const url = new URL(req.url ?? '/', 'http://doh.invalid')
    if (req.method !== 'GET' || url.pathname !== PATH) {
      res.writeHead(req.method === 'GET' ? 404 : 405).end()
      return
    }
    const query = Buffer.from(url.searchParams.get('dns') ?? '', 'base64url')
    const question = parseQuestion(query)
    if (question === null) {
      res.writeHead(400).end()
      return
    }
    questions.push(
      `${question.name} ${TYPE_NAMES[question.type] ?? `TYPE${String(question.type)}`}`,
    )
    if (failure.location !== undefined) {
      res.writeHead(302, { location: failure.location }).end()
      return
    }
    const entry = typeof zone === 'function' ? zone(question.name) : zone[question.name]
    if (entry?.hang === true) return
    res.writeHead(failure.status ?? 200, {
      'content-type': failure.contentType ?? 'application/dns-message',
    })
    res.end(failure.status === undefined ? (failure.body ?? answer(query, question, entry)) : '')
  })
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string')
    throw new Error('The DoH stand-in has no port')
  return {
    port: address.port,
    url: `http://127.0.0.1:${String(address.port)}${PATH}`,
    questions,
    requests,
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

interface Question {
  readonly name: string
  readonly type: number
  /** Offset just past the question section. */
  readonly end: number
}

function parseQuestion(message: Buffer): Question | null {
  const labels: string[] = []
  let at = 12
  for (;;) {
    const length = message[at]
    if (length === undefined) return null
    at += 1
    if (length === 0) break
    labels.push(message.subarray(at, at + length).toString('ascii'))
    at += length
  }
  if (at + 4 > message.length) return null
  return { name: labels.join('.').toLowerCase(), type: message.readUInt16BE(at), end: at + 4 }
}

/** A TXT record's data: each string with its length before it, 255 bytes at most each. */
function txtData(record: string | readonly string[]): Buffer {
  const strings = typeof record === 'string' ? [record] : record
  return Buffer.concat(
    strings.map((text) => {
      const bytes = Buffer.from(text, 'utf8')
      if (bytes.length > 255) throw new Error('A TXT string holds 255 bytes at most')
      return Buffer.concat([Buffer.from([bytes.length]), bytes])
    }),
  )
}

function answer(query: Buffer, question: Question, entry: DohEntry | undefined): Buffer {
  const records =
    entry?.rcode === undefined && question.type === TYPE_TXT ? (entry?.txt ?? []).map(txtData) : []
  const header = Buffer.from(query.subarray(0, 12))
  // A response, recursion desired and available; NXDOMAIN (3) when the name is not in the zone.
  const rcode = entry === undefined ? 3 : (entry.rcode ?? 0)
  header.writeUInt16BE(0x8180 | rcode, 2)
  header.writeUInt16BE(1, 4)
  header.writeUInt16BE(records.length, 6)
  header.writeUInt16BE(0, 8)
  header.writeUInt16BE(0, 10)
  const answers = records.map((data) => {
    const record = Buffer.alloc(12)
    record.writeUInt16BE(0xc00c, 0) // the name: a pointer to the question's
    record.writeUInt16BE(question.type, 2)
    record.writeUInt16BE(1, 4) // class IN
    record.writeUInt32BE(60, 6) // TTL
    record.writeUInt16BE(data.length, 10)
    return Buffer.concat([record, data])
  })
  return Buffer.concat([header, query.subarray(12, question.end), ...answers])
}

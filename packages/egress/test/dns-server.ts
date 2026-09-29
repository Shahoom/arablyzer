import dgram from 'node:dgram'
import ipaddr from 'ipaddr.js'

export interface ZoneEntry {
  readonly A?: readonly string[]
  readonly AAAA?: readonly string[]
  /** Each record, one string or the several strings one record holds (RFC 1035 §3.3.14). */
  readonly TXT?: readonly (string | readonly string[])[]
  /** Answer with this RCODE and nothing else: 2 SERVFAIL, 5 REFUSED. */
  readonly rcode?: number
  /** Never answer: simulates a nameserver that hangs. */
  readonly hang?: boolean
}

export interface DnsServer {
  /** "127.0.0.1:<port>", ready for Resolver#setServers. */
  readonly server: string
  /** Every question asked, as "name TYPE": "example.test A", "_dmarc.example.test TXT". */
  readonly queries: string[]
  close(): Promise<void>
}

const TYPE_A = 1
const TYPE_TXT = 16
const TYPE_AAAA = 28
const TYPE_NAMES: Readonly<Record<number, string>> = {
  [TYPE_A]: 'A',
  [TYPE_TXT]: 'TXT',
  [TYPE_AAAA]: 'AAAA',
}

/**
 * A tiny DNS server on 127.0.0.1 for tests: A, AAAA and TXT answers, NXDOMAIN for unknown names,
 * an RCODE of the zone's choosing, or silence. It logs every question with its type, so a test
 * can show what was asked and what never was.
 */
export async function startDnsServer(
  zone: Readonly<Record<string, ZoneEntry>>,
): Promise<DnsServer> {
  const socket = dgram.createSocket('udp4')
  const queries: string[] = []
  socket.on('message', (message, remote) => {
    const query = parseQuery(message)
    if (query === null) return
    queries.push(`${query.name} ${TYPE_NAMES[query.type] ?? `TYPE${String(query.type)}`}`)
    const entry = zone[query.name]
    if (entry?.hang === true) return
    socket.send(buildAnswer(message, query, entry), remote.port, remote.address)
  })
  await new Promise<void>((resolve) => {
    socket.bind(0, '127.0.0.1', resolve)
  })
  return {
    server: `127.0.0.1:${socket.address().port}`,
    queries,
    close: () =>
      new Promise((resolve) => {
        socket.close(() => {
          resolve()
        })
      }),
  }
}

interface Query {
  readonly name: string
  readonly type: number
  /** Offset just past the question section. */
  readonly end: number
}

function parseQuery(message: Buffer): Query | null {
  const labels: string[] = []
  let offset = 12
  for (;;) {
    const length = message[offset]
    if (length === undefined) return null
    offset += 1
    if (length === 0) break
    labels.push(message.subarray(offset, offset + length).toString('ascii'))
    offset += length
  }
  if (offset + 4 > message.length) return null
  return {
    name: labels.join('.').toLowerCase(),
    type: message.readUInt16BE(offset),
    end: offset + 4,
  }
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

function recordsOf(query: Query, entry: ZoneEntry | undefined): Buffer[] {
  switch (query.type) {
    case TYPE_A:
      return (entry?.A ?? []).map((address) => Buffer.from(ipaddr.parse(address).toByteArray()))
    case TYPE_AAAA:
      return (entry?.AAAA ?? []).map((address) => Buffer.from(ipaddr.parse(address).toByteArray()))
    case TYPE_TXT:
      return (entry?.TXT ?? []).map(txtData)
    default:
      return []
  }
}

function buildAnswer(message: Buffer, query: Query, entry: ZoneEntry | undefined): Buffer {
  const records = entry?.rcode === undefined ? recordsOf(query, entry) : []
  const header = Buffer.from(message.subarray(0, 12))
  // Response, recursion desired + available; NXDOMAIN (rcode 3) when the name is unknown.
  const rcode = entry === undefined ? 3 : (entry.rcode ?? 0)
  header.writeUInt16BE(0x8180 | rcode, 2)
  header.writeUInt16BE(1, 4)
  header.writeUInt16BE(records.length, 6)
  header.writeUInt16BE(0, 8)
  header.writeUInt16BE(0, 10)
  const answers = records.map((rdata) => {
    const record = Buffer.alloc(12)
    record.writeUInt16BE(0xc00c, 0) // name: pointer to the question
    record.writeUInt16BE(query.type, 2)
    record.writeUInt16BE(1, 4) // class IN
    record.writeUInt32BE(60, 6) // TTL
    record.writeUInt16BE(rdata.length, 10)
    return Buffer.concat([record, rdata])
  })
  return Buffer.concat([header, message.subarray(12, query.end), ...answers])
}

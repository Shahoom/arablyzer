import { dnsName } from './dns-name'
import { safeFetch } from './fetch'
import type { EgressPolicy } from './policy'
import type { Resolver, TxtAnswer, TxtResolver } from './resolve'

// TXT lookups as DNS over HTTPS (RFC 8484), M2.3c review. Behind the egress proxy a scanner
// resolves no name of its own, so it asks a resolver over HTTPS, with safeFetch: the request is
// vetted like any other, and goes through the proxy like all scan traffic. The wire format
// (RFC 1035 §4.1) is written and read here, for TXT records alone.

/** The resolver a process behind an egress proxy asks, unless ARABLYZER_DOH_URL names another. */
export const DEFAULT_DOH_URL = 'https://cloudflare-dns.com/dns-query'
/** The environment variable that names the DoH resolver, as its URL. */
export const DOH_URL_VARIABLE = 'ARABLYZER_DOH_URL'
/** Each lookup gets this long, the request and its answer. */
export const DOH_TIMEOUT_MS = 10_000
/** A DNS message is 65535 bytes at most (RFC 1035 §4.2.2): a longer answer is not read. */
export const MAX_DNS_MESSAGE_BYTES = 65_535

const HEADER_BYTES = 12
const TYPE_TXT = 16
const TYPE_CNAME = 5
const CLASS_IN = 1
/** RFC 1035 §4.1.1: QR, the bit that makes a message a response. */
const FLAG_RESPONSE = 0x8000
/** TC: the answer did not fit, so what it holds is not all of it. */
const FLAG_TRUNCATED = 0x0200
const RCODE_MASK = 0x000f
const RCODE_NXDOMAIN = 3
/** RFC 1035 §2.3.4: a name is 255 octets on the wire. */
const MAX_WIRE_NAME = 255
/** Aliases followed from the name asked to the name that holds the records. */
const MAX_CNAMES = 16

const FAILED: TxtAnswer = Object.freeze({ outcome: 'failed', records: Object.freeze([]) })
const NONE: TxtAnswer = Object.freeze({ outcome: 'none', records: Object.freeze([]) })

/** A message that is not the answer to a TXT question: cut short, or its lengths and names lie. */
class Malformed extends Error {}

/**
 * The query for a name's TXT records (RFC 1035 §4.1): a header with an ID of 0 (RFC 8484 §4.1, so
 * that HTTP caches can share it), recursion desired and one question, TXT in class IN. A name the
 * resolver must not send (dnsName) is a TypeError.
 */
export function encodeTxtQuery(name: string): Uint8Array {
  const valid = dnsName(name)
  if (valid === null) throw new TypeError(`Not a name a lookup may send: ${JSON.stringify(name)}`)
  const labels = valid.split('.')
  const message = new Uint8Array(
    HEADER_BYTES + labels.reduce((sum, label) => sum + 1 + label.length, 0) + 1 + 4,
  )
  const view = new DataView(message.buffer)
  view.setUint16(2, 0x0100) // recursion desired
  view.setUint16(4, 1) // one question
  let at = HEADER_BYTES
  for (const label of labels) {
    message[at++] = label.length
    // ASCII, by dnsName.
    for (let index = 0; index < label.length; index++) message[at++] = label.charCodeAt(index)
  }
  message[at++] = 0
  view.setUint16(at, TYPE_TXT)
  view.setUint16(at + 2, CLASS_IN)
  return message
}

/**
 * The GET request of a lookup (RFC 8484 §4.1.1): the resolver's URL with the query in its `dns`
 * variable, in base64url without padding. The resolver's own query, if it has one, stays.
 */
export function dohQueryUrl(resolver: string, name: string): string {
  const url = new URL(resolver)
  url.searchParams.set('dns', Buffer.from(encodeTxtQuery(name)).toString('base64url'))
  return url.href
}

/**
 * A DNS answer's TXT records for the name asked (RFC 1035 §4.1): each record's strings joined
 * without spaces (RFC 7208 §3.3), those of the name an alias leads to when the name is one.
 * A name that does not exist (NXDOMAIN), or has no such records, has none; a message that is not
 * a whole answer to that question (a failure of the server, a truncated or malformed message, an
 * answer to another question) is a failure, never read as none.
 */
export function decodeTxtAnswer(message: Uint8Array, name: string): TxtAnswer {
  const asked = dnsName(name)
  if (asked === null) return FAILED
  try {
    return read(message, asked)
  } catch (error) {
    if (error instanceof Malformed || error instanceof RangeError) return FAILED
    throw error
  }
}

function read(message: Uint8Array, asked: string): TxtAnswer {
  if (message.length < HEADER_BYTES) throw new Malformed('Shorter than a header')
  const view = new DataView(message.buffer, message.byteOffset, message.byteLength)
  const flags = view.getUint16(2)
  if ((flags & FLAG_RESPONSE) === 0) throw new Malformed('Not a response')
  if ((flags & FLAG_TRUNCATED) !== 0) throw new Malformed('Truncated')
  const rcode = flags & RCODE_MASK
  if (rcode !== 0 && rcode !== RCODE_NXDOMAIN) throw new Malformed(`RCODE ${String(rcode)}`)
  if (view.getUint16(4) !== 1) throw new Malformed('Not one question')
  const question = readName(message, HEADER_BYTES)
  let at = question.next
  if (
    question.name !== asked ||
    view.getUint16(at) !== TYPE_TXT ||
    view.getUint16(at + 2) !== CLASS_IN
  ) {
    throw new Malformed('The answer is to another question')
  }
  at += 4
  // RFC 8020: a name that does not exist has no records of any type.
  if (rcode === RCODE_NXDOMAIN) return NONE
  const aliases = new Map<string, string>()
  const texts: { readonly owner: string; readonly data: Uint8Array }[] = []
  for (let count = view.getUint16(6); count > 0; count--) {
    const owner = readName(message, at)
    at = owner.next
    if (at + 10 > message.length) throw new Malformed('A record cut short')
    const type = view.getUint16(at)
    const recordClass = view.getUint16(at + 2)
    const length = view.getUint16(at + 8)
    at += 10
    if (at + length > message.length) throw new Malformed('A record’s data cut short')
    if (recordClass === CLASS_IN && type === TYPE_TXT) {
      texts.push({ owner: owner.name, data: message.subarray(at, at + length) })
    } else if (recordClass === CLASS_IN && type === TYPE_CNAME) {
      const target = readName(message, at)
      if (target.next !== at + length) throw new Malformed('An alias that is not a name')
      aliases.set(owner.name, target.name)
    }
    at += length
  }
  // The name the records are at: the name asked, or where its aliases lead.
  let holder = asked
  const followed = new Set([holder])
  for (let next = aliases.get(holder); next !== undefined; next = aliases.get(holder)) {
    if (followed.has(next) || followed.size > MAX_CNAMES) throw new Malformed('Aliases in a loop')
    followed.add(next)
    holder = next
  }
  const records = texts.filter((text) => text.owner === holder).map((text) => joined(text.data))
  return records.length === 0 ? NONE : { outcome: 'found', records }
}

/**
 * A domain name at an offset (RFC 1035 §4.1.4): labels, ending in the root or a pointer to a name
 * earlier in the message. Pointers point back only, so they cannot loop; a label of a kind the
 * RFC leaves unused, or holding a dot, is refused. `next` is where the message goes on.
 */
function readName(message: Uint8Array, start: number): { name: string; next: number } {
  const labels: string[] = []
  let at = start
  let next = -1
  let size = 1
  for (;;) {
    const length = message[at]
    if (length === undefined) throw new Malformed('A name cut short')
    if (length === 0) break
    const kind = length & 0xc0
    if (kind === 0xc0) {
      const low = message[at + 1]
      if (low === undefined) throw new Malformed('A pointer cut short')
      const target = ((length & 0x3f) << 8) | low
      if (target >= at) throw new Malformed('A pointer that does not point back')
      if (next === -1) next = at + 2
      at = target
      continue
    }
    if (kind !== 0) throw new Malformed('A label of a kind that is not used')
    if (at + 1 + length > message.length) throw new Malformed('A label cut short')
    size += 1 + length
    if (size > MAX_WIRE_NAME) throw new Malformed('A name longer than 255 bytes')
    const label = Buffer.from(message.subarray(at + 1, at + 1 + length)).toString('latin1')
    if (label.includes('.')) throw new Malformed('A label with a dot in it')
    labels.push(label.toLowerCase())
    at += 1 + length
  }
  return { name: labels.join('.'), next: next === -1 ? at + 1 : next }
}

/** A TXT record's strings, each with its length before it (RFC 1035 §3.3.14), joined as one. */
function joined(data: Uint8Array): string {
  const parts: Uint8Array[] = []
  for (let at = 0; at < data.length;) {
    const length = data[at] ?? 0
    if (at + 1 + length > data.length) throw new Malformed('A string longer than its record')
    parts.push(data.subarray(at + 1, at + 1 + length))
    at += 1 + length
  }
  return new TextDecoder().decode(Buffer.concat(parts))
}

/** A resolver's URL: https, or http outside production; no user, password or fragment. */
function validDohUrl(value: string, httpsOnly: boolean): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new TypeError('The DNS-over-HTTPS resolver is not a URL')
  }
  if (url.protocol !== 'https:' && (url.protocol !== 'http:' || httpsOnly)) {
    throw new TypeError(`The DNS-over-HTTPS resolver is https://…, not ${url.protocol}//…`)
  }
  if (url.username !== '' || url.password !== '' || url.hash !== '') {
    throw new TypeError('The DNS-over-HTTPS resolver has a user name, a password or a fragment')
  }
  return url.href
}

/**
 * The DoH resolver a process asks (M2.3c review): ARABLYZER_DOH_URL when it is set, whatever the
 * policy; else DEFAULT_DOH_URL behind an egress proxy (`upstream`), which is the only way such a
 * process reaches a resolver; else none, and the process asks DNS itself with c-ares. Outside
 * production the URL may be http, for a resolver on the developer's machine. The URL is vetted
 * again with every request, like any other (safeFetch), so this checks its shape alone.
 */
export function dohUrlFrom(
  env: Readonly<Record<string, string | undefined>>,
  policy: EgressPolicy,
): string | undefined {
  const given = env[DOH_URL_VARIABLE]?.trim()
  if (given === undefined || given === '') {
    return policy.upstream === undefined ? undefined : DEFAULT_DOH_URL
  }
  return validDohUrl(given, env.NODE_ENV === 'production')
}

export interface DohOptions {
  /** The resolver's URL (RFC 8484 §3: https://…/dns-query). */
  readonly url: string
  /** Sent as the lookups' user agent: Arablyzer identifies itself here too. */
  readonly userAgent: string
  /** The scan's own policy: the lookups go through its egress proxy, and are vetted by its rules. */
  readonly policy?: EgressPolicy
  /** Resolves the resolver's own name, where the policy has no egress proxy to do it. */
  readonly resolver?: Resolver
  /** Per lookup; DOH_TIMEOUT_MS by default. */
  readonly timeoutMs?: number
}

/**
 * TXT lookups over HTTPS (RFC 8484), with safeFetch: one GET for the one name asked, vetted like
 * every request the scan makes, through the egress proxy where the policy has one; no redirect is
 * followed, and no more than a DNS message is read. Never throws: no answer in time, a failed
 * request, a status other than 200, a content type other than application/dns-message and a
 * message that is not a whole answer are all `failed`.
 */
export function createDohTxtResolver(options: DohOptions): TxtResolver {
  const url = validDohUrl(options.url, false)
  return async (name, signal) => {
    const asked = dnsName(name)
    if (asked === null || signal.aborted) return FAILED
    try {
      const fetched = await safeFetch(dohQueryUrl(url, asked), {
        userAgent: options.userAgent,
        accept: 'application/dns-message',
        timeoutMs: options.timeoutMs ?? DOH_TIMEOUT_MS,
        maxBytes: MAX_DNS_MESSAGE_BYTES,
        // A resolver answers where it is asked: a redirect would send the query elsewhere.
        maxRedirects: 0,
        signal,
        ...(options.policy === undefined ? {} : { policy: options.policy }),
        ...(options.resolver === undefined ? {} : { resolver: options.resolver }),
      })
      const response = fetched.response
      if (fetched.error !== null || response?.status !== 200) return FAILED
      const type = response.headers.find(([header]) => header === 'content-type')?.[1]
      if (type?.split(';')[0]?.trim().toLowerCase() !== 'application/dns-message') return FAILED
      return decodeTxtAnswer(response.body, asked)
    } catch {
      return FAILED
    }
  }
}

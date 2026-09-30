import {
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  type KeyObject,
} from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import tls from 'node:tls'

/**
 * Certificates for fixture sites served over HTTPS, signed by a certificate authority this
 * process makes for itself: tests trust it in their own process (trustFixtureCa) or in a child's
 * (fixtureCaFile), so no code of Arablyzer's needs a way to trust anything else. Built with
 * node:crypto alone: ECDSA P-256 keys, and the few X.509 fields TLS clients check.
 */

export interface KeyAndCertificate {
  readonly key: string
  readonly cert: string
}

interface Authority extends KeyAndCertificate {
  readonly privateKey: KeyObject
}

let authority: Authority | undefined
let authorityFile: string | undefined

const DAY = 86_400_000

/** The process's test certificate authority, made on first use. */
export function fixtureCa(): KeyAndCertificate {
  authority ??= makeAuthority()
  return { key: authority.key, cert: authority.cert }
}

/** Trusts the test authority in this process, besides the usual ones. */
export function trustFixtureCa(): void {
  const { cert } = fixtureCa()
  const current = tls.getCACertificates('default')
  if (!current.includes(cert)) tls.setDefaultCACertificates([...current, cert])
}

/** The test authority as a PEM file, for a child process's NODE_EXTRA_CA_CERTS. */
export function fixtureCaFile(): string {
  if (authorityFile === undefined) {
    const dir = mkdtempSync(path.join(tmpdir(), 'arablyzer-fixture-ca-'))
    authorityFile = path.join(dir, 'ca.pem')
    writeFileSync(authorityFile, fixtureCa().cert)
  }
  return authorityFile
}

/**
 * A server certificate for the given host names and IP addresses, signed by the test authority,
 * valid from `notBefore` to `notAfter`.
 */
export function serverCertificate(
  hosts: readonly string[],
  notBefore: Date,
  notAfter: Date,
): KeyAndCertificate {
  authority ??= makeAuthority()
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const names = hosts.map((host) =>
    isIP(host) === 4
      ? context(7, Buffer.from(host.split('.').map(Number)))
      : context(2, Buffer.from(host, 'ascii')),
  )
  const cert = certificate({
    subject: hosts[0] ?? 'localhost',
    issuer: AUTHORITY_NAME,
    notBefore,
    notAfter,
    publicKey: publicKey.export({ type: 'spki', format: 'der' }),
    extensions: [
      extension(OID.basicConstraints, true, sequence()),
      extension(OID.keyUsage, true, bitString(Buffer.from([0x80]), 7)),
      extension(OID.extKeyUsage, false, sequence(oid(OID.serverAuth))),
      extension(OID.subjectAltName, false, sequence(...names)),
    ],
    signer: authority.privateKey,
  })
  return { key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), cert }
}

/** A certificate `lifetimeDays` long with `daysLeft` of it to run. */
export function certificateWindow(lifetimeDays: number, daysLeft: number): [Date, Date] {
  const now = Date.now()
  return [new Date(now - (lifetimeDays - daysLeft) * DAY), new Date(now + daysLeft * DAY)]
}

const AUTHORITY_NAME = 'Arablyzer Test CA'

function makeAuthority(): Authority {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const now = Date.now()
  const cert = certificate({
    subject: AUTHORITY_NAME,
    issuer: AUTHORITY_NAME,
    notBefore: new Date(now - DAY),
    notAfter: new Date(now + 3650 * DAY),
    publicKey: publicKey.export({ type: 'spki', format: 'der' }),
    extensions: [
      extension(OID.basicConstraints, true, sequence(boolean(true))),
      // keyCertSign and cRLSign.
      extension(OID.keyUsage, true, bitString(Buffer.from([0x06]), 1)),
    ],
    signer: privateKey,
  })
  const key = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  return { key, cert, privateKey: createPrivateKey(key) }
}

interface CertificateFields {
  readonly subject: string
  readonly issuer: string
  readonly notBefore: Date
  readonly notAfter: Date
  readonly publicKey: Buffer
  readonly extensions: readonly Buffer[]
  readonly signer: KeyObject
}

const OID = {
  ecdsaWithSha256: '1.2.840.10045.4.3.2',
  commonName: '2.5.4.3',
  basicConstraints: '2.5.29.19',
  keyUsage: '2.5.29.15',
  extKeyUsage: '2.5.29.37',
  subjectAltName: '2.5.29.17',
  serverAuth: '1.3.6.1.5.5.7.3.1',
} as const

/** An X.509 v3 certificate in PEM (RFC 5280 §4.1). */
function certificate(fields: CertificateFields): string {
  const algorithm = sequence(oid(OID.ecdsaWithSha256))
  const tbs = sequence(
    context(0, integer(Buffer.from([2])), true),
    // A positive serial: the top bit clear.
    integer(Buffer.concat([Buffer.from([0x01]), randomBytes(15)])),
    algorithm,
    name(fields.issuer),
    sequence(time(fields.notBefore), time(fields.notAfter)),
    name(fields.subject),
    fields.publicKey,
    context(3, sequence(...fields.extensions), true),
  )
  const signature = sign('sha256', tbs, fields.signer)
  const der = sequence(tbs, algorithm, bitString(signature, 0))
  const lines = der.toString('base64').match(/.{1,64}/g) ?? []
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`
}

function tlv(tag: number, value: Buffer): Buffer {
  const length = value.length
  if (length < 0x80) return Buffer.concat([Buffer.from([tag, length]), value])
  const bytes: number[] = []
  for (let rest = length; rest > 0; rest = Math.floor(rest / 256)) bytes.unshift(rest & 0xff)
  return Buffer.concat([Buffer.from([tag, 0x80 | bytes.length, ...bytes]), value])
}

const sequence = (...items: Buffer[]) => tlv(0x30, Buffer.concat(items))
const set = (...items: Buffer[]) => tlv(0x31, Buffer.concat(items))
const integer = (value: Buffer) => tlv(0x02, value)
const boolean = (value: boolean) => tlv(0x01, Buffer.from([value ? 0xff : 0]))
const octetString = (value: Buffer) => tlv(0x04, value)
const bitString = (value: Buffer, unused: number) =>
  tlv(0x03, Buffer.concat([Buffer.from([unused]), value]))
/** A context-specific tag: constructed (explicit) or primitive (implicit). */
const context = (tag: number, value: Buffer, constructed = false) =>
  tlv((constructed ? 0xa0 : 0x80) | tag, value)

function oid(dotted: string): Buffer {
  const [first = 0, second = 0, ...rest] = dotted.split('.').map(Number)
  const bytes = [first * 40 + second]
  for (const part of rest) {
    const chunk = [part & 0x7f]
    for (let value = Math.floor(part / 128); value > 0; value = Math.floor(value / 128)) {
      chunk.unshift((value & 0x7f) | 0x80)
    }
    bytes.push(...chunk)
  }
  return tlv(0x06, Buffer.from(bytes))
}

function name(commonName: string): Buffer {
  return sequence(set(sequence(oid(OID.commonName), tlv(0x0c, Buffer.from(commonName, 'utf8')))))
}

/** UTCTime, YYMMDDHHMMSSZ, which RFC 5280 asks for until 2050. */
function time(date: Date): Buffer {
  const text = date.toISOString().replace(/[-:T]/g, '').slice(2, 14)
  return tlv(0x17, Buffer.from(`${text}Z`, 'ascii'))
}

function extension(id: string, critical: boolean, value: Buffer): Buffer {
  return sequence(oid(id), ...(critical ? [boolean(true)] : []), octetString(value))
}

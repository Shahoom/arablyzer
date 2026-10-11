import { createHash, randomBytes } from 'node:crypto'
import { API_KEY_PREFIX_LENGTH } from '@arablyzer/api-contract'

/** 16 random bytes in base64url: 22 characters, never guessed (Phase 2 design §3). */
export function newScanId(): string {
  return randomBytes(16).toString('base64url')
}

/**
 * A report's deletion token: 32 random bytes in base64url, 43 characters (M5, issue #33). Given
 * once, in the scan's creation response; what is kept is its hash.
 */
export function newDeleteToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * What is kept of a deletion token: its SHA-256, in hex. The token is 256 random bits, so it
 * needs no salt and no stretching; a store that leaks holds nothing that deletes a report.
 */
export function hashDeleteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** A saved site's id: the same shape as a scan's (M4.2). */
export function newSiteId(): string {
  return randomBytes(16).toString('base64url')
}

/** A crawl's id: the same shape as a scan's (M4.5). */
export function newCrawlId(): string {
  return randomBytes(16).toString('base64url')
}

/** A PDF's id: the same shape as a scan's. */
export function newPdfId(): string {
  return newCrawlId()
}

/** An API key's id: the same shape as a scan's (M5.1). */
export function newApiKeyId(): string {
  return randomBytes(16).toString('base64url')
}

/**
 * An API key (M5.1): `arb_` and 256 random bits. The secret is shown once; what is kept is its
 * SHA-256 (the delete token's reasoning: nothing to stretch or salt in 256 random bits, and a slow
 * hash would make every request a cost) and the first characters, to tell keys apart.
 */
export function newApiKey(): {
  readonly secret: string
  readonly prefix: string
  readonly hash: string
} {
  const secret = `arb_${randomBytes(32).toString('base64url')}`
  return { secret, prefix: secret.slice(0, API_KEY_PREFIX_LENGTH), hash: hashApiKey(secret) }
}

export function hashApiKey(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

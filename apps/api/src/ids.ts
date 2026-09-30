import { createHash, randomBytes } from 'node:crypto'

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

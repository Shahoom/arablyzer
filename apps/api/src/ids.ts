import { randomBytes } from 'node:crypto'

/** 16 random bytes in base64url: 22 characters, never guessed (Phase 2 design §3). */
export function newScanId(): string {
  return randomBytes(16).toString('base64url')
}

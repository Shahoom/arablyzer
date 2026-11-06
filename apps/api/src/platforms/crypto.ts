import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import type { PlatformTokens } from './types'

// Tokens are kept sealed: AES-256-GCM under a key derived from ARABLYZER_PLATFORM_SECRET, with
// the store's own name (platform and store key) as the associated data, so a sealed value copied
// onto another store's row does not open. A database that leaks holds nothing a platform accepts.

const VERSION = 'v1'

/** The key for sealing: HKDF-SHA-256 of the owner's secret, for this use alone. */
export function sealKeyFrom(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, 'arablyzer', 'platform tokens aes-256-gcm', 32))
}

/** `v1.<iv>.<ciphertext>.<tag>`, each part base64url. */
export function seal(key: Buffer, context: string, tokens: PlatformTokens): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(context))
  const body = JSON.stringify({
    a: tokens.access,
    r: tokens.refresh,
    m: tokens.manager,
    e: tokens.expiresAt.getTime(),
  })
  const sealed = Buffer.concat([cipher.update(body, 'utf8'), cipher.final()])
  return [VERSION, iv.toString('base64url'), sealed.toString('base64url')]
    .concat(cipher.getAuthTag().toString('base64url'))
    .join('.')
}

/** The tokens in a sealed value; null for anything not sealed here for this store. */
export function open(key: Buffer, context: string, sealed: string): PlatformTokens | null {
  const [version, iv, body, tag, extra] = sealed.split('.')
  if (
    version !== VERSION ||
    iv === undefined ||
    body === undefined ||
    tag === undefined ||
    extra !== undefined
  ) {
    return null
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
    decipher.setAAD(Buffer.from(context))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    const plain = Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()])
    const parsed = JSON.parse(plain.toString('utf8')) as {
      a?: unknown
      r?: unknown
      m?: unknown
      e?: unknown
    }
    if (typeof parsed.a !== 'string' || typeof parsed.e !== 'number') return null
    return {
      access: parsed.a,
      refresh: typeof parsed.r === 'string' ? parsed.r : null,
      manager: typeof parsed.m === 'string' ? parsed.m : null,
      expiresAt: new Date(parsed.e),
    }
  } catch {
    return null
  }
}

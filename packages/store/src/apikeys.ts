// What the API keys keep (M5.1). A key is 256 random bits shown once; only its SHA-256 is kept,
// with a short prefix to tell a person's keys apart. Like the account's other data it belongs to
// the account and goes with it. Revoking deletes the row, so a revoked key is a key nobody has.

export interface ApiKeyRecord {
  readonly id: string
  readonly userId: string
  readonly name: string
  /** `arb_` and the first four characters of the secret. */
  readonly prefix: string
  readonly createdAt: Date
  /** When the key last authenticated a request, to the hour; null before its first use. */
  readonly lastUsedAt: Date | null
}

export interface NewApiKey {
  readonly id: string
  readonly userId: string
  readonly name: string
  readonly prefix: string
  /** SHA-256 of the whole secret, in hex. */
  readonly hash: string
  readonly createdAt: Date
}

export type KeyCreated =
  | { readonly kind: 'created'; readonly key: ApiKeyRecord }
  /** The account holds as many keys as its plan allows. */
  | { readonly kind: 'limit' }

/** A use is noted at most this often per key: a busy client does not write on every request. */
export const KEY_TOUCH_MS = 60 * 60 * 1000

export interface ApiKeyData {
  /** Counted and inserted as one step, so two requests at once cannot pass the limit. */
  create(key: NewApiKey, limit: number): Promise<KeyCreated>
  /** The person's keys, oldest first. */
  list(userId: string): Promise<ApiKeyRecord[]>
  /** False when the person has no such key. */
  revoke(userId: string, keyId: string): Promise<boolean>
  /** Whose key this is, from the hash of the secret presented; null for a hash nobody holds. */
  authenticate(hash: string): Promise<{ readonly keyId: string; readonly userId: string } | null>
  /** Notes that the key was used; a use within `KEY_TOUCH_MS` of the last noted one is not written. */
  touch(keyId: string, at: Date): Promise<void>
  eraseUser(userId: string): Promise<void>
}

interface Stored extends ApiKeyRecord {
  readonly hash: string
}

/** ApiKeyData in memory, for tests and `pnpm dev`. */
export class MemoryApiKeyData implements ApiKeyData {
  readonly #keys = new Map<string, Stored>()

  create(key: NewApiKey, limit: number): Promise<KeyCreated> {
    const mine = [...this.#keys.values()].filter((kept) => kept.userId === key.userId)
    if (mine.length >= limit) return Promise.resolve({ kind: 'limit' })
    const { hash: _hash, ...record } = key
    const stored: Stored = { ...record, lastUsedAt: null, hash: key.hash }
    this.#keys.set(key.id, stored)
    return Promise.resolve({ kind: 'created', key: record_(stored) })
  }

  list(userId: string): Promise<ApiKeyRecord[]> {
    return Promise.resolve(
      [...this.#keys.values()]
        .filter((key) => key.userId === userId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map(record_),
    )
  }

  revoke(userId: string, keyId: string): Promise<boolean> {
    const key = this.#keys.get(keyId)
    if (key?.userId !== userId) return Promise.resolve(false)
    this.#keys.delete(keyId)
    return Promise.resolve(true)
  }

  authenticate(hash: string) {
    for (const key of this.#keys.values()) {
      if (key.hash === hash) return Promise.resolve({ keyId: key.id, userId: key.userId })
    }
    return Promise.resolve(null)
  }

  touch(keyId: string, at: Date): Promise<void> {
    const key = this.#keys.get(keyId)
    if (key === undefined) return Promise.resolve()
    if (key.lastUsedAt === null || at.getTime() - key.lastUsedAt.getTime() >= KEY_TOUCH_MS) {
      this.#keys.set(keyId, { ...key, lastUsedAt: at })
    }
    return Promise.resolve()
  }

  eraseUser(userId: string): Promise<void> {
    for (const [id, key] of this.#keys) if (key.userId === userId) this.#keys.delete(id)
    return Promise.resolve()
  }
}

function record_(key: Stored): ApiKeyRecord {
  const { hash: _hash, ...rest } = key
  return rest
}

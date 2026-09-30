import { ScanEvent } from '@arablyzer/api-contract'
import type { Window } from '@arablyzer/plans'
import type { Redis } from 'ioredis'
import { secondsUntilOne, type RateLimiter, type Taken } from './limits'
import type { ScanEvents, StoredEvent } from './types'

const PREFIX = 'arablyzer'
/** A scan's events live a day: its page reads them while it runs; its report lives on in PostgreSQL. */
const EVENTS_TTL_SECONDS = 24 * 60 * 60
/** More than any scan sends, so trimming never loses one. */
const EVENTS_MAX = 1000
/** A stream ID: milliseconds, a dash, a sequence, each at most 2^64 − 1 as Valkey keeps them. */
const STREAM_ID = /^(\d{1,20})-(\d{1,20})$/
const U64_MAX = 2n ** 64n - 1n

/** The ID to read after: one Valkey could have given, or the stream's start. */
function readAfter(after: string | null): string {
  const parts = after === null ? null : STREAM_ID.exec(after)
  if (parts === null) return '0-0'
  return BigInt(parts[1] ?? '') <= U64_MAX && BigInt(parts[2] ?? '') <= U64_MAX ? parts[0] : '0-0'
}

const eventsKey = (scanId: string) => `${PREFIX}:scan:${scanId}:events`

/** Entries as XRANGE and XREAD give them, as the page reads them. */
function stored(entries: [id: string, fields: string[]][]): StoredEvent[] {
  return entries.flatMap(([id, fields]) => {
    const value = fields[fields.indexOf('e') + 1]
    return value === undefined ? [] : [{ id, event: ScanEvent.parse(JSON.parse(value)) }]
  })
}

/** Read afresh: an await may have passed since the signal was last looked at. */
const stopped = (signal: AbortSignal): boolean => signal.aborted

/** Each scan's events in a Valkey stream, trimmed and expiring with the scan. */
export class ValkeyScanEvents implements ScanEvents {
  readonly #redis: Redis
  readonly #heartbeatMs: number

  constructor(redis: Redis, heartbeatMs = 15_000) {
    this.#redis = redis
    this.#heartbeatMs = heartbeatMs
  }

  async publish(scanId: string, event: ScanEvent): Promise<string> {
    const key = eventsKey(scanId)
    const results = await this.#redis
      .multi()
      .xadd(
        key,
        'MAXLEN',
        '~',
        String(EVENTS_MAX),
        '*',
        'e',
        JSON.stringify(ScanEvent.parse(event)),
      )
      .expire(key, EVENTS_TTL_SECONDS)
      .exec()
    const [error, id] = results?.[0] ?? [new Error('No reply to XADD'), null]
    if (error !== null || typeof id !== 'string') throw error ?? new Error('XADD gave no ID')
    return id
  }

  async since(scanId: string, after: string | null): Promise<StoredEvent[]> {
    return stored(await this.#redis.xrange(eventsKey(scanId), `(${readAfter(after)}`, '+'))
  }

  /**
   * Blocking reads need a connection of their own, so each follower gets one, closed when it
   * stops; the signal closes it too, which ends a read that is waiting. The API caps how many
   * follow at once (apps/api). The reader queues its commands until it is connected, and gives
   * up on a read that outlasts the heartbeat, as when Valkey stops answering.
   */
  async *follow(
    scanId: string,
    after: string | null,
    signal: AbortSignal,
  ): AsyncGenerator<StoredEvent | null> {
    const key = eventsKey(scanId)
    let last = readAfter(after)
    const reader = this.#redis.duplicate({
      enableOfflineQueue: true,
      commandTimeout: this.#heartbeatMs + 5_000,
    })
    const close = () => {
      reader.disconnect()
    }
    signal.addEventListener('abort', close, { once: true })
    try {
      while (!signal.aborted) {
        let reply
        try {
          reply = await reader.xread('BLOCK', this.#heartbeatMs, 'STREAMS', key, last)
        } catch (error) {
          // Closing the connection is how a waiting read is stopped.
          if (stopped(signal)) return
          throw error
        }
        if (reply === null) {
          yield null
          continue
        }
        for (const [, entries] of reply) {
          last = entries.at(-1)?.[0] ?? last
          yield* stored(entries)
        }
      }
    } finally {
      signal.removeEventListener('abort', close)
      close()
    }
  }
}

/**
 * The token bucket in one step on the server, so two API processes cannot both take the last
 * scan. Numbers go back as strings: Valkey turns a script's numbers into integers. The key
 * expires when the bucket would be full again, so nothing is kept longer than the limit needs.
 * The last update never moves back, so a process whose clock lags adds no tokens.
 */
const TAKE = `
local capacity = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local rate = capacity / window
local state = redis.call('HMGET', KEYS[1], 'tokens', 'updated')
local tokens = tonumber(state[1]) or capacity
local updated = tonumber(state[2]) or now
tokens = math.min(capacity, tokens + math.max(0, now - updated) * rate)
local taken = 0
if tokens >= 1 then
  tokens = tokens - 1
  taken = 1
end
redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'updated', tostring(math.max(updated, now)))
redis.call('PEXPIRE', KEYS[1], math.max(1, math.ceil((capacity - tokens) / rate)))
return { taken, tostring(tokens) }
`

export class ValkeyRateLimiter implements RateLimiter {
  readonly #redis: Redis

  constructor(redis: Redis) {
    this.#redis = redis
  }

  async take(key: string, window: Window, now: number): Promise<Taken> {
    const reply = (await this.#redis.eval(
      TAKE,
      1,
      `${PREFIX}:limit:${key}`,
      String(window.scans),
      String(window.seconds * 1000),
      String(now),
    )) as [number, string]
    const [taken, tokens] = reply
    return taken === 1
      ? { ok: true }
      : { ok: false, retryAfterSeconds: secondsUntilOne(Number(tokens), window) }
  }
}

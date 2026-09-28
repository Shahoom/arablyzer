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
/** A stream ID: milliseconds, a dash, a sequence. */
const STREAM_ID = /^\d{1,20}-\d{1,20}$/

const eventsKey = (scanId: string) => `${PREFIX}:scan:${scanId}:events`

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

  /**
   * Blocking reads need a connection of their own, so each follower gets one, closed when it
   * stops; the signal closes it too, which ends a read that is waiting.
   */
  async *follow(
    scanId: string,
    after: string | null,
    signal: AbortSignal,
  ): AsyncGenerator<StoredEvent | null> {
    const key = eventsKey(scanId)
    let last = after !== null && STREAM_ID.test(after) ? after : '0-0'
    const reader = this.#redis.duplicate()
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
          for (const [id, fields] of entries) {
            last = id
            const value = fields[fields.indexOf('e') + 1]
            if (value !== undefined) yield { id, event: ScanEvent.parse(JSON.parse(value)) }
          }
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
redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'updated', tostring(now))
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

import type { Prices } from './settings'

/** What a response used, as the API reports it (a missing count is none). */
export interface Tokens {
  readonly input: number
  readonly output: number
  readonly cacheRead: number
  readonly cacheWrite: number
}

/**
 * What a response cost, in micro-units. Prices are units per million tokens, so a token costs its
 * price in micro-units. Rounded up: the cap is never undercounted by a fraction.
 */
export function costMicro(tokens: Tokens, prices: Prices): number {
  return Math.ceil(
    tokens.input * prices.input +
      tokens.output * prices.output +
      tokens.cacheRead * prices.cacheRead +
      tokens.cacheWrite * prices.cacheWrite,
  )
}

/**
 * The most a request can cost: every token of its input at the dearer of the input and the cache-write
 * price (a byte is no more than half a token's worth of text here, which holds for Arabic and for
 * code), and the answer at its limit, thinking included. It is held against the caps until the
 * response says what it did cost.
 */
export function worstCaseMicro(
  requestBytes: number,
  maxOutputTokens: number,
  prices: Prices,
): number {
  const inputTokens = Math.ceil(requestBytes / 2) + 64
  return Math.ceil(
    inputTokens * Math.max(prices.input, prices.cacheWrite) + maxOutputTokens * prices.output,
  )
}

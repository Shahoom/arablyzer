import type { Header } from '@arablyzer/collectors'
import { asciiLowercase, getDecodeSplit } from './headers'

/**
 * A bot protection service's documented mark of a challenge: a response header, and the values
 * that say the answer is a challenge rather than the page asked for.
 */
export interface ChallengeSignal {
  /** The service, as its documentation names it. */
  readonly service: string
  /** Lowercased, as the fetch gives header names. */
  readonly header: string
  /** Lowercased: the header's values are compared case aside. */
  readonly values: readonly string[]
  /** Where the service documents the header. */
  readonly source: string
}

/**
 * Only the signals a service documents for telling its challenge apart (M2.3c); nothing is
 * guessed from a page's text. Updated when a service documents one.
 */
export const CHALLENGE_SIGNALS: readonly ChallengeSignal[] = [
  {
    service: 'Cloudflare',
    header: 'cf-mitigated',
    values: ['challenge'],
    source:
      'https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/',
  },
  {
    service: 'AWS WAF',
    header: 'x-amzn-waf-action',
    values: ['challenge', 'captcha'],
    source:
      'https://docs.aws.amazon.com/waf/latest/developerguide/waf-captcha-and-challenge-actions.html',
  },
]

/** A challenge the response was: the service, and its header with the value that says so. */
export interface Challenge {
  readonly service: string
  readonly header: string
  readonly value: string
}

/** The challenge a response's headers mark, by the first signal they carry; null for none. */
export function challengeOf(headers: readonly Header[]): Challenge | null {
  for (const signal of CHALLENGE_SIGNALS) {
    const value = (getDecodeSplit(headers, signal.header) ?? [])
      .map(asciiLowercase)
      .find((candidate) => signal.values.includes(candidate))
    if (value !== undefined) return { service: signal.service, header: signal.header, value }
  }
  return null
}

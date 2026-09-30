import raw from '../generated/bot.json'

// The bot as its page describes it (scripts/bot-data.ts): each number is the code's own.

export interface BotFacts {
  /** The user agent of every request outside a browser. */
  readonly userAgent: string
  /** What each browser adds to its own user agent. */
  readonly browserToken: string
  readonly pageRedirects: number
  readonly robotsRedirects: number
  readonly robotsKib: number
  /**
   * The sitemaps robots.txt names that a check fetches at most, what it reads of each, the
   * redirects it follows for one, and the seconds it stops after, for all of them.
   */
  readonly sitemaps: number
  readonly sitemapMib: number
  readonly sitemapRedirects: number
  readonly sitemapSeconds: number
  /** At most, for one page load in a browser: requests, and mebibytes to and from the network. */
  readonly requestsPerLoad: number
  readonly mibPerLoad: number
  readonly viewport: { readonly width: number; readonly height: number }
}

export const BOT_FACTS = raw as BotFacts

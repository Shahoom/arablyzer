import { BOT_TOKEN, VIEWPORT } from '@arablyzer/browser'
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_REDIRECTS, DEFAULT_MAX_REQUESTS } from '@arablyzer/egress'
import {
  ROBOTS_MAX_BYTES,
  ROBOTS_MAX_REDIRECTS,
  SITEMAP_LIMIT,
  SITEMAP_MAX_BYTES,
  SITEMAP_MAX_REDIRECTS,
  SITEMAP_TIMEOUT_MS,
  USER_AGENT,
} from '@arablyzer/engine'
import type { BotFacts } from '../src/lib/bot'

// What the bot's page says of it, from the code that does it (M2.4b), for src/generated/bot.json:
// generate.ts writes it, since Astro's build cannot bundle the engine.

export function botFacts(): BotFacts {
  return {
    userAgent: USER_AGENT,
    browserToken: BOT_TOKEN,
    pageRedirects: DEFAULT_MAX_REDIRECTS,
    robotsRedirects: ROBOTS_MAX_REDIRECTS,
    robotsKib: ROBOTS_MAX_BYTES / 1024,
    sitemaps: SITEMAP_LIMIT,
    sitemapMib: SITEMAP_MAX_BYTES / (1024 * 1024),
    sitemapRedirects: SITEMAP_MAX_REDIRECTS,
    sitemapSeconds: SITEMAP_TIMEOUT_MS / 1000,
    requestsPerLoad: DEFAULT_MAX_REQUESTS,
    mibPerLoad: DEFAULT_MAX_BYTES / (1024 * 1024),
    viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
  }
}

import { DEFAULT_MAX_HOSTS } from '@arablyzer/browser'
import { DEFAULT_DOH_URL, DEFAULT_MAX_REDIRECTS, DEFAULT_MAX_REQUESTS } from '@arablyzer/egress'
import {
  MAX_LINKS,
  SITEMAP_LIMIT,
  SITEMAP_MAX_REDIRECTS,
  SITEMAP_TIMEOUT_MS,
  USER_AGENT,
} from '@arablyzer/engine'
import { PAGES_UI } from '@arablyzer/i18n'
import { describe, expect, it } from 'vitest'
import { botFacts } from '../scripts/bot-data'

describe('botFacts', () => {
  it("says what the code does: the user agent, and each limit in the code's own numbers", () => {
    const facts = botFacts()
    expect(facts.userAgent).toBe(USER_AGENT)
    expect(facts.userAgent.startsWith('ArablyzerBot/')).toBe(true)
    expect(facts.browserToken.startsWith('ArablyzerBot/')).toBe(true)
    expect(facts.pageRedirects).toBe(DEFAULT_MAX_REDIRECTS)
    expect(facts.requestsPerLoad).toBe(DEFAULT_MAX_REQUESTS)
    expect(facts.hostsPerLoad).toBe(DEFAULT_MAX_HOSTS)
    expect(Number.isInteger(facts.robotsKib)).toBe(true)
    expect(Number.isInteger(facts.mibPerLoad)).toBe(true)
    expect(facts.sitemaps).toBe(SITEMAP_LIMIT)
    expect(Number.isInteger(facts.sitemapMib)).toBe(true)
    expect(facts.sitemapRedirects).toBe(SITEMAP_MAX_REDIRECTS)
    expect(facts.sitemapSeconds * 1000).toBe(SITEMAP_TIMEOUT_MS)
  })

  // M2.3c review: the two TXT lookups of the DNS rules go to a resolver outside the site, and the
  // bot's page says which.
  it('names the DNS-over-HTTPS resolver the service asks, from the code, in both languages', () => {
    const facts = botFacts()
    expect(facts.dohUrl).toBe(DEFAULT_DOH_URL)
    expect(new URL(facts.dohUrl).hostname).toBe('cloudflare-dns.com')
    for (const lang of ['ar', 'en'] as const) {
      const fetched = PAGES_UI[lang].bot.fetches.items(facts).join('\n')
      expect(fetched, lang).toContain(facts.dohUrl)
      expect(fetched, lang).toContain('Cloudflare')
      expect(fetched, lang).toContain('_dmarc')
    }
  })

  // M1 review (issue #29): the bot's page says its browsers reach at most this many hosts, and
  // that they send no data a page asks them to, in both languages.
  it('says how many hosts a browser may reach, from the code, and that no data is sent', () => {
    const facts = botFacts()
    for (const lang of ['ar', 'en'] as const) {
      const bot = PAGES_UI[lang].bot
      expect(bot.fetches.items(facts).join('\n'), lang).toContain(String(facts.hostsPerLoad))
      expect(bot.never.items.join('\n'), lang).toContain('sendBeacon')
    }
  })

  // M2.3c review: the requests for a page's links are not the visit someone asked for, so the `*`
  // group of robots.txt applies to them; the bot's page says so, with the number of links.
  it('says how many links a check asks for, and that the * group applies to them', () => {
    const facts = botFacts()
    expect(facts.links).toBe(MAX_LINKS)
    for (const lang of ['ar', 'en'] as const) {
      const bot = PAGES_UI[lang].bot
      const fetched = bot.fetches.items(facts).join('\n')
      expect(fetched, lang).toContain(String(facts.links))
      expect(fetched, lang).toContain('User-agent: *')
      expect(bot.optOut.notes.join('\n'), lang).toContain('*')
    }
  })
})

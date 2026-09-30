import { DEFAULT_DOH_URL, DEFAULT_MAX_REDIRECTS, DEFAULT_MAX_REQUESTS } from '@arablyzer/egress'
import { USER_AGENT } from '@arablyzer/engine'
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
    expect(Number.isInteger(facts.robotsKib)).toBe(true)
    expect(Number.isInteger(facts.mibPerLoad)).toBe(true)
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
})

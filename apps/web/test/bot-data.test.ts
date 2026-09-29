import { DEFAULT_MAX_REDIRECTS, DEFAULT_MAX_REQUESTS } from '@arablyzer/egress'
import { SITEMAP_LIMIT, USER_AGENT } from '@arablyzer/engine'
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
    expect(facts.sitemaps).toBe(SITEMAP_LIMIT)
    expect(Number.isInteger(facts.sitemapMib)).toBe(true)
  })
})

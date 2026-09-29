import { challengeOf } from '../../lib/challenges'
import { defineRule, type DetectorFinding } from '../../rule'

/**
 * Information: the site answered the scan's own request with a bot challenge instead of the page,
 * as its service documents the mark of one (lib/challenges.ts); other bots, AI crawlers among
 * them, may be refused the same way. It reads the answer whatever its status: a challenge is
 * often a 403, and AWS WAF's a 202. Nothing is guessed from the page's text, and nothing ever
 * tries to get past a challenge: the engine neither renders nor measures one.
 */
export const rule = defineRule({
  id: 'bot-challenge',
  version: '1.0.0',
  category: 'ai',
  severity: 'info',
  needs: ['response'],
  messages: ['challenge'],
  appliesTo: () => true,
  detect: ({ page }): DetectorFinding<'challenge'>[] => {
    const challenge = challengeOf(page.headers)
    if (challenge === null) return []
    const { service, header, value } = challenge
    return [
      {
        message: 'challenge',
        snippet: `${header}: ${value}`,
        values: { service, header, value, status: page.status },
      },
    ]
  },
})

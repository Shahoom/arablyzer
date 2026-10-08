import type { SafeBrowsingThreat } from '@arablyzer/collectors'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'malware' | 'social-engineering' | 'unwanted-software' | 'harmful-app'

const MESSAGES: Readonly<Record<SafeBrowsingThreat, Message>> = {
  MALWARE: 'malware',
  SOCIAL_ENGINEERING: 'social-engineering',
  UNWANTED_SOFTWARE: 'unwanted-software',
  POTENTIALLY_HARMFUL_APPLICATION: 'harmful-app',
}

/**
 * Critical: Google Safe Browsing lists the page's URL or its origin as malware, social
 * engineering (phishing), unwanted software or a harmful app. Browsers that use the list, Chrome,
 * Firefox and Safari among them, warn visitors before the page opens. One finding for each type
 * Google lists. It needs a key; without one, or for a private page, it does not apply, and a
 * failed question is an error, never a verdict.
 */
export const rule = defineRule({
  id: 'safe-browsing-flagged',
  version: '1.0.0',
  category: 'trust',
  severity: 'critical',
  needs: ['safe-browsing'],
  messages: ['malware', 'social-engineering', 'unwanted-software', 'harmful-app'],
  appliesTo: (_page, evidence) => evidence?.safeBrowsing?.outcome !== undefined,
  detect: ({ safeBrowsing }): DetectorFinding<Message>[] =>
    (safeBrowsing?.threats ?? []).map(({ type, url }) => ({
      message: MESSAGES[type],
      values: { url },
      key: type,
    })),
})

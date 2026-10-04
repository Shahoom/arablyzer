import { confidenceLevel, detectPlatforms, type PlatformKind } from '../../lib/platforms'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'platform' | 'builder' | 'plugin' | 'service'

const MESSAGES: Readonly<Record<PlatformKind, Message>> = {
  platform: 'platform',
  builder: 'builder',
  plugin: 'plugin',
  service: 'service',
}

/**
 * Information alone: the platform the page runs on (CMS or store), its builder, its major plugins
 * and the services it loads (analytics, CDN, frameworks), from what the page and its server
 * show (lib/platforms.ts). Never deducted: which platform a site uses is not a fault. One finding
 * for each technology, with its version where the page says, how sure the match is and what
 * was seen.
 */
export const rule = defineRule({
  id: 'platform-detected',
  version: '1.0.0',
  category: 'onpage',
  severity: 'info',
  needs: ['html', 'headers'],
  messages: ['platform', 'builder', 'plugin', 'service'],
  appliesTo: (page) => page.html !== null,
  detect: ({ page }): DetectorFinding<Message>[] =>
    detectPlatforms(page).map((found) => ({
      message: MESSAGES[found.kind],
      values: {
        name: found.name,
        version: found.version ?? '',
        versionText: found.version === null ? '' : ` ${found.version}`,
        confidence: found.confidence,
        level: confidenceLevel(found.confidence),
        evidence: found.evidence.join(' · '),
        source: found.source,
      },
      snippet: found.evidence[0] ?? '',
      key: found.id,
    })),
})

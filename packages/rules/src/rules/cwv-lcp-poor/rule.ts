import { hasVital, POOR, poorVital } from '../../lib/crux'
import { defineRule } from '../../rule'

/**
 * Milliseconds as the message's seconds: down to a tenth, so "{value} s or longer" holds, and
 * exact when a tenth would reach the limit itself (4,001 ms as 4.001, never as 4) (M1.3b review).
 */
function seconds(ms: number): number {
  const tenths = Math.floor(ms / 100) / 10
  return tenths > POOR.lcp / 1000 ? tenths : ms / 1000
}

/**
 * Real visits on phones, from the Chrome UX Report: the 75th percentile of Largest Contentful Paint is
 * over Google's limit for poor (lib/crux.ts). The page's own data, or its site's when CrUX has
 * none for the page alone.
 */
export const rule = defineRule({
  id: 'cwv-lcp-poor',
  version: '1.0.0',
  category: 'speed',
  severity: 'serious',
  needs: ['crux'],
  messages: ['url', 'origin'],
  appliesTo: (_page, evidence) => hasVital(evidence?.crux, 'lcp'),
  detect: ({ crux }) => poorVital(crux, 'lcp', seconds),
})

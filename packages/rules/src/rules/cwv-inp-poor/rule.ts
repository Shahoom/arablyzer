import { hasVital, poorVital } from '../../lib/crux'
import { defineRule } from '../../rule'

/**
 * Real visits on phones, from the Chrome UX Report: the 75th percentile of Interaction to Next Paint is
 * over Google's limit for poor (lib/crux.ts). The page's own data, or its site's when CrUX has
 * none for the page alone.
 */
export const rule = defineRule({
  id: 'cwv-inp-poor',
  version: '1.0.0',
  category: 'speed',
  severity: 'serious',
  needs: ['crux'],
  messages: ['url', 'origin'],
  appliesTo: (_page, evidence) => hasVital(evidence?.crux, 'inp'),
  detect: ({ crux }) => poorVital(crux, 'inp', (ms) => Math.round(ms)),
})

import { hasVital, poorVital } from '../../lib/crux'
import { defineRule } from '../../rule'

/**
 * Real visits on phones, from the Chrome UX Report: the 75th percentile of Cumulative Layout Shift is
 * over Google's limit for poor (lib/crux.ts). The page's own data, or its site's when CrUX has
 * none for the page alone.
 */
export const rule = defineRule({
  id: 'cwv-cls-poor',
  version: '1.0.0',
  category: 'speed',
  severity: 'serious',
  needs: ['crux'],
  messages: ['url', 'origin'],
  appliesTo: (_page, evidence) => hasVital(evidence?.crux, 'cls'),
  detect: ({ crux }) => poorVital(crux, 'cls', (value) => Math.round(value * 100) / 100),
})

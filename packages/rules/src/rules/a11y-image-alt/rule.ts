import { atNode, axeApplies, axeNodes } from '../../lib/axe'
import { defineRule } from '../../rule'

/** Images without a text alternative, as axe-core finds them (WCAG 1.1.1). */
export const rule = defineRule({
  id: 'a11y-image-alt',
  version: '1.0.0',
  category: 'trust',
  severity: 'critical',
  wcag: ['1.1.1'],
  needs: ['render'],
  messages: ['missing'],
  appliesTo: (_page, evidence) => axeApplies(evidence, 'image-alt'),
  detect: ({ rendered = [] }) =>
    axeNodes(rendered, 'image-alt', 'violations').map((sighting) => ({
      message: 'missing' as const,
      ...atNode(sighting).evidence,
    })),
})

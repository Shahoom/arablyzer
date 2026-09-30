import { atNode, axeApplies, axeNodes } from '../../lib/axe'
import { defineRule } from '../../rule'

/** Buttons without an accessible name, as axe-core finds them (WCAG 4.1.2). */
export const rule = defineRule({
  id: 'a11y-button-name',
  version: '1.0.0',
  category: 'trust',
  severity: 'critical',
  wcag: ['4.1.2'],
  needs: ['render'],
  messages: ['missing'],
  appliesTo: (_page, evidence) => axeApplies(evidence, 'button-name'),
  detect: ({ rendered = [] }) =>
    axeNodes(rendered, 'button-name', 'violations').map((sighting) => ({
      message: 'missing' as const,
      ...atNode(sighting).evidence,
    })),
})

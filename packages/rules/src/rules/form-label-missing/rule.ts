import { atNode, axeApplies, axeNodes } from '../../lib/axe'
import { defineRule } from '../../rule'

/** Form fields without a label, as axe-core finds them (WCAG 4.1.2). */
export const rule = defineRule({
  id: 'form-label-missing',
  version: '1.0.0',
  category: 'forms',
  severity: 'critical',
  wcag: ['4.1.2'],
  needs: ['render'],
  messages: ['missing'],
  appliesTo: (_page, evidence) => axeApplies(evidence, 'label'),
  detect: ({ rendered = [] }) =>
    axeNodes(rendered, 'label', 'violations').map((sighting) => ({
      message: 'missing' as const,
      ...atNode(sighting).evidence,
    })),
})

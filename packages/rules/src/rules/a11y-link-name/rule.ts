import { atNode, axeApplies, axeNodes } from '../../lib/axe'
import { defineRule } from '../../rule'

/** Links without an accessible name, as axe-core finds them (WCAG 2.4.4, 4.1.2). */
export const rule = defineRule({
  id: 'a11y-link-name',
  version: '1.0.0',
  category: 'trust',
  severity: 'serious',
  wcag: ['2.4.4', '4.1.2'],
  needs: ['render'],
  messages: ['missing'],
  appliesTo: (_page, evidence) => axeApplies(evidence, 'link-name'),
  detect: ({ rendered = [] }) =>
    axeNodes(rendered, 'link-name', 'violations').map((sighting) => ({
      message: 'missing' as const,
      ...atNode(sighting).evidence,
    })),
})

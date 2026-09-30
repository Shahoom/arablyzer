import { atNode, axeApplies, axeNodes } from '../../lib/axe'
import { defineRule } from '../../rule'

/** lang attributes inside the page that name no language, as axe-core finds them (WCAG 3.1.2). */
export const rule = defineRule({
  id: 'a11y-valid-lang',
  version: '1.0.0',
  category: 'trust',
  severity: 'serious',
  wcag: ['3.1.2'],
  needs: ['render'],
  messages: ['invalid'],
  appliesTo: (_page, evidence) => axeApplies(evidence, 'valid-lang'),
  detect: ({ rendered = [] }) =>
    axeNodes(rendered, 'valid-lang', 'violations').map((sighting) => ({
      message: 'invalid' as const,
      ...atNode(sighting).evidence,
    })),
})

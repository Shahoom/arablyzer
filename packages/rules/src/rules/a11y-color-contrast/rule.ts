import { atNode, axeApplies, axeNodes } from '../../lib/axe'
import { defineRule, type DetectorFinding } from '../../rule'

/**
 * Text below WCAG 1.4.3's contrast, as axe-core measures it, Arabic text included: the browser
 * package keeps axe from taking Arabic for icon-font ligatures (docs/design/plans/m1.2b-axe-forms.md).
 */
export const rule = defineRule({
  id: 'a11y-color-contrast',
  version: '1.0.0',
  category: 'trust',
  severity: 'serious',
  wcag: ['1.4.3'],
  needs: ['render'],
  messages: ['low'],
  appliesTo: (_page, evidence) => axeApplies(evidence, 'color-contrast'),
  detect: ({ rendered = [] }) =>
    axeNodes(rendered, 'color-contrast', 'violations').flatMap(
      (sighting): DetectorFinding<'low'>[] => {
        const { node, evidence } = atNode(sighting)
        const contrast = node?.contrast
        if (contrast === null || contrast === undefined) return []
        return [
          {
            message: 'low',
            values: {
              ratio: contrast.ratio,
              expected: contrast.expected,
              foreground: contrast.foreground,
              background: contrast.background,
            },
            ...evidence,
          },
        ]
      },
    ),
})

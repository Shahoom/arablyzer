import { atNode, axeNodes, axeUndecided } from '../../lib/axe'
import { defineRule } from '../../rule'

type Message = 'image' | 'gradient' | 'overlap' | 'other'

/** axe-core's reasons for leaving a text's contrast undecided, by what the reader is told. */
const REASONS: Readonly<Record<string, Message>> = {
  bgImage: 'image',
  imgNode: 'image',
  bgGradient: 'gradient',
  bgOverlap: 'overlap',
  elmPartiallyObscured: 'overlap',
  elmPartiallyObscuring: 'overlap',
}

/**
 * Text whose contrast axe-core could not measure, such as text over an image: a person has to
 * look (Phase 1 design §8), so it is reported for review and never deducted.
 */
export const rule = defineRule({
  id: 'a11y-color-contrast-review',
  version: '1.0.0',
  category: 'trust',
  severity: 'serious',
  wcag: ['1.4.3'],
  manualCheck: true,
  needs: ['render'],
  messages: ['image', 'gradient', 'overlap', 'other'],
  appliesTo: (_page, evidence) => axeUndecided(evidence, 'color-contrast'),
  detect: ({ rendered = [] }) =>
    axeNodes(rendered, 'color-contrast', 'incomplete').map((sighting) => {
      const { node, evidence } = atNode(sighting)
      const reason = node?.reason ?? null
      const message: Message = (reason === null ? undefined : REASONS[reason]) ?? 'other'
      return {
        message,
        ...(message === 'other' ? { values: { reason: reason ?? 'unknown' } } : {}),
        ...evidence,
      }
    }),
})

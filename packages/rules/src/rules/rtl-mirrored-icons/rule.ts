import type { DirectionIconFact } from '@arablyzer/collectors'
import { renderedFacts, Sightings } from '../../lib/rendered'
import { defineRule } from '../../rule'

/** An icon named by a class or a Material name; an arrow is a character of the text itself. */
const isCharacter = (name: string): boolean => Array.from(name).length === 1

/**
 * Direction icons in right-to-left text drawn as for left-to-right text: icon-font classes and
 * Material names that point right or forward, and right arrows beside Arabic words, with no
 * transform that mirrors them. A right arrow may be right ("back" on an Arabic page), so a person
 * decides: reported for review, never deducted (docs/design/plans/m1.2c-css-fonts.md §2).
 */
export const rule = defineRule({
  id: 'rtl-mirrored-icons',
  version: '1.0.0',
  category: 'rtl',
  severity: 'minor',
  manualCheck: true,
  needs: ['render'],
  messages: ['icon', 'arrow'],
  appliesTo: (_page, evidence) =>
    renderedFacts(evidence).some((facts) => facts.directionIcons.length > 0),
  detect: ({ rendered = [] }) => {
    const icons = new Sightings<DirectionIconFact>()
    for (const facts of rendered) {
      for (const icon of facts.directionIcons) {
        icons.add(`${icon.selector}\n${icon.name}`, facts.engine, icon)
      }
    }
    return [...icons].flatMap(({ engines, each }) => {
      const icon = engines[0] === undefined ? undefined : each.get(engines[0])
      if (icon === undefined) return []
      return [
        {
          message: isCharacter(icon.name) ? ('arrow' as const) : ('icon' as const),
          values: { name: icon.name },
          selector: icon.selector,
          engines,
          box: icon.box,
          key: icon.name,
        },
      ]
    })
  },
})

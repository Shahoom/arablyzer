import type { RoleIconFact } from '@arablyzer/collectors'
import { renderedFacts, Sightings } from '../../lib/rendered'
import { defineRule } from '../../rule'

/**
 * A control that says what it does, and an icon that points the other way: «التالي» with an arrow
 * to the right, «رجوع» with an arrow to the left, in text read from right to left, where going on
 * is going left (docs/design/plans/arabic-native.md §5). The browser reads the control's label,
 * text, rel and class for its role, and the icon from its class, Material name, SVG name or arrow
 * character, then turns it by any mirroring transform and by a class the page swaps for right to
 * left. Only a control whose every icon points the wrong way is reported; a control whose icon's
 * direction is not known is not judged. Moderate: visitors read the arrow before the word.
 */
export const rule = defineRule({
  id: 'rtl-icon-role',
  version: '1.0.0',
  category: 'rtl',
  severity: 'moderate',
  needs: ['render'],
  messages: ['next', 'prev'],
  appliesTo: (_page, evidence) => renderedFacts(evidence).some((facts) => facts.dir === 'rtl'),
  detect: ({ rendered = [] }) => {
    const icons = new Sightings<RoleIconFact>()
    for (const facts of rendered) {
      for (const icon of facts.roleIcons) {
        icons.add(`${icon.selector}\n${icon.role}`, facts.engine, icon)
      }
    }
    return [...icons].flatMap(({ engines, each }) => {
      const icon = engines[0] === undefined ? undefined : each.get(engines[0])
      if (icon === undefined) return []
      return [
        {
          message: icon.role,
          values: { name: icon.name, label: icon.label },
          selector: icon.selector,
          engines,
          box: icon.box,
          key: `${icon.role}:${icon.name}`,
        },
      ]
    })
  },
})

import type { DirectionIconFact, RenderedFacts } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, renderedEvidence, renderedFacts } from '../../../test/helpers'
import { rule } from './rule'

// The browser suite renders the wrong and right fixtures in every engine; here the detector
// reads the icons the render found.
const icon = (overrides: Partial<DirectionIconFact> = {}): DirectionIconFact => ({
  selector: '#next',
  box: { x: 20, y: 90, width: 12, height: 12 },
  name: 'fa-arrow-right',
  ...overrides,
})

const facts = (engine: RenderedFacts['engine'], icons: readonly DirectionIconFact[]) =>
  renderedFacts(engine, { directionIcons: icons })

describe('rtl-mirrored-icons', () => {
  it('asks a person to look at each unmirrored direction icon, never deducting', () => {
    expect(rule.manualCheck).toBe(true)
    expect(
      detectAll(
        rule,
        renderedEvidence([
          facts('chromium', [icon(), icon({ selector: '#more', name: '→' })]),
          facts('firefox', [icon()]),
        ]),
      ),
    ).toEqual([
      {
        message: 'icon',
        values: { name: 'fa-arrow-right' },
        selector: '#next',
        engines: ['chromium', 'firefox'],
        box: icon().box,
        key: 'fa-arrow-right',
      },
      {
        message: 'arrow',
        values: { name: '→' },
        selector: '#more',
        engines: ['chromium'],
        box: icon().box,
        key: '→',
      },
    ])
  })

  it('names Material icons as icons', () => {
    expect(
      detectAll(rule, renderedEvidence([facts('chromium', [icon({ name: 'arrow_forward' })])])),
    ).toMatchObject([{ message: 'icon', values: { name: 'arrow_forward' } }])
  })

  it('applies only when there is an icon to look at', () => {
    expect(applies(rule, renderedEvidence([facts('chromium', [icon()])]))).toBe(true)
    expect(applies(rule, renderedEvidence([facts('chromium', [])]))).toBe(false)
  })
})

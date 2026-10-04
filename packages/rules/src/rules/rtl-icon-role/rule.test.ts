import type { RenderedFacts, RoleIconFact } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { detectAll, renderedEvidence, renderedFacts } from '../../../test/helpers'
import { rule } from './rule'

// The browser suite renders controls in every engine; here the detector reads what the render found.
const icon = (overrides: Partial<RoleIconFact> = {}): RoleIconFact => ({
  selector: 'a.next > span',
  box: { x: 20, y: 90, width: 12, height: 12 },
  role: 'next',
  pointing: 'right',
  name: 'icon-arrow-right',
  label: 'التالي',
  ...overrides,
})

const facts = (engine: RenderedFacts['engine'], icons: readonly RoleIconFact[]) =>
  renderedFacts(engine, { roleIcons: icons })

describe('rtl-icon-role', () => {
  it('reports a control once for all the engines that saw its icon against its role', () => {
    expect(
      detectAll(
        rule,
        renderedEvidence([
          facts('chromium', [
            icon(),
            icon({ selector: '.back', role: 'prev', pointing: 'left', name: '←', label: 'رجوع' }),
          ]),
          facts('firefox', [icon()]),
        ]),
      ),
    ).toEqual([
      {
        message: 'next',
        values: { name: 'icon-arrow-right', label: 'التالي' },
        selector: 'a.next > span',
        engines: ['chromium', 'firefox'],
        box: icon().box,
        key: 'next:icon-arrow-right',
      },
      {
        message: 'prev',
        values: { name: '←', label: 'رجوع' },
        selector: '.back',
        engines: ['chromium'],
        box: icon().box,
        key: 'prev:←',
      },
    ])
  })

  it('applies only when an engine found such a control', () => {
    expect(rule.severity).toBe('moderate')
    expect(detectAll(rule, renderedEvidence([facts('chromium', [])]))).toEqual([])
  })
})

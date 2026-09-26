import { describe, expect, it } from 'vitest'
import { applies, detectAll, renderedEvidence, renderedFacts } from '../../../test/helpers'
import { declaresDeviceWidth, rule } from './rule'

// The browser suite renders the wrong and right fixtures in every engine; here the detector
// reads facts as engines report them. Chromium measured the wrong fixture as below.
const drawer = { selector: 'html > body > nav', box: { x: -280, y: 0, width: 260, height: 20 } }
const wide = { selector: 'table', box: { x: -90, y: 300, width: 480, height: 200 } }

describe('rtl-horizontal-overflow', () => {
  it('fires on each element that reaches past the screen, by how far it reaches', () => {
    const findings = detectAll(
      rule,
      renderedEvidence([renderedFacts('chromium', { scrollWidth: 670, overflow: [drawer, wide] })]),
    )
    expect(findings).toEqual([
      {
        message: 'element',
        values: { overflow: 280, viewportWidth: 390 },
        selector: 'html > body > nav',
        engines: ['chromium'],
        box: drawer.box,
      },
      {
        message: 'element',
        values: { overflow: 90, viewportWidth: 390 },
        selector: 'table',
        engines: ['chromium'],
        box: wide.box,
      },
    ])
  })

  it('measures the reach past the end edge only, which is the one a page scrolls to (M1.1 review)', () => {
    // Past the left edge by 90, and past the right one by 220, which cannot be scrolled to.
    const both = { selector: 'table', box: { x: -90, y: 300, width: 700, height: 200 } }
    expect(
      detectAll(
        rule,
        renderedEvidence([renderedFacts('chromium', { scrollWidth: 480, overflow: [both] })]),
      ),
    ).toMatchObject([{ values: { overflow: 90 } }])
  })

  it('reports the page itself when no element could be named', () => {
    expect(
      detectAll(rule, renderedEvidence([renderedFacts('firefox', { scrollWidth: 450 })])),
    ).toEqual([
      {
        message: 'page',
        values: { scrollWidth: 450, viewportWidth: 390 },
        selector: 'html',
        engines: ['firefox'],
      },
    ])
  })

  it('reports an element once across engines', () => {
    const findings = detectAll(
      rule,
      renderedEvidence([
        renderedFacts('chromium', { scrollWidth: 670, overflow: [drawer] }),
        renderedFacts('webkit', { scrollWidth: 670, overflow: [drawer] }),
      ]),
    )
    expect(findings.map((finding) => finding.engines)).toEqual([['chromium', 'webkit']])
  })

  it('allows a pixel of rounding, and passes pages that fit', () => {
    expect(
      detectAll(rule, renderedEvidence([renderedFacts('chromium', { scrollWidth: 391 })])),
    ).toEqual([])
  })

  it('applies to right-to-left pages made for the phone width', () => {
    expect(applies(rule, renderedEvidence([renderedFacts()]))).toBe(true)
    expect(applies(rule, renderedEvidence([renderedFacts('chromium', { dir: 'ltr' })]))).toBe(false)
    expect(
      applies(rule, renderedEvidence([renderedFacts('chromium', { viewportMeta: null })])),
    ).toBe(false)
  })

  it.each([
    ['width=device-width, initial-scale=1', true],
    ['initial-scale=1; WIDTH = Device-Width', true],
    ['width=1024', false],
    ['initial-scale=1', false],
    ['', false],
  ])('reads the viewport meta %j as made for the phone width: %s', (content, expected) => {
    expect(declaresDeviceWidth(content)).toBe(expected)
  })
})

import type { PhysicalCssFact, RenderedFacts } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, renderedEvidence, renderedFacts } from '../../../test/helpers'
import { rule } from './rule'

// The browser suite renders the wrong and right fixtures in every engine; here the detector
// reads the declarations the render found in the page's stylesheets.
const SHEET = 'http://fixture.test/css/site.css'

const sheet = (overrides: Partial<PhysicalCssFact> = {}): PhysicalCssFact => ({
  url: SHEET,
  inline: false,
  count: 3,
  examples: [
    { selector: 'ul.menu', property: 'padding-left', value: '0', line: 7, column: 3 },
    { selector: '.menu li', property: 'float', value: 'left', line: 11, column: 3 },
  ],
  ...overrides,
})

function facts(
  engine: RenderedFacts['engine'],
  physical: readonly PhysicalCssFact[],
  overrides: Partial<RenderedFacts> = {},
): RenderedFacts {
  return renderedFacts(engine, {
    stylesheets: { read: 1 + physical.length, unread: 0, physical },
    ...overrides,
  })
}

describe('rtl-physical-css', () => {
  it('reports each stylesheet that sets sides by left and right, at its first declaration', () => {
    expect(detectAll(rule, renderedEvidence([facts('chromium', [sheet()])]))).toEqual([
      {
        message: 'physical',
        values: { count: 3 },
        url: SHEET,
        snippet: 'ul.menu { padding-left: 0 }',
        location: { line: 7, column: 3 },
        engines: ['chromium'],
        key: SHEET,
      },
    ])
  })

  it('reports a stylesheet once for all engines, with the most any of them counted', () => {
    const findings = detectAll(
      rule,
      renderedEvidence([facts('chromium', [sheet()]), facts('firefox', [sheet({ count: 4 })])]),
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ values: { count: 4 }, engines: ['chromium', 'firefox'] })
  })

  it('gives the page’s <style> elements no line, since theirs are not the page’s', () => {
    const [finding] = detectAll(
      rule,
      renderedEvidence([
        facts('chromium', [sheet({ url: 'http://fixture.test/', inline: true, count: 1 })]),
      ]),
    )
    expect(finding).toMatchObject({ url: 'http://fixture.test/', key: 'inline' })
    expect(finding?.location).toBeUndefined()
  })

  it('leaves out files named for right-to-left pages', () => {
    for (const url of [
      'https://cdn.example.com/bootstrap.rtl.min.css',
      'https://example.com/wp-content/themes/shop/style-rtl.css',
      'https://example.com/css/rtl.css?v=2',
    ]) {
      expect(detectAll(rule, renderedEvidence([facts('chromium', [sheet({ url })])]))).toEqual([])
    }
    const shortly = 'https://example.com/css/shortly.css'
    expect(
      detectAll(rule, renderedEvidence([facts('chromium', [sheet({ url: shortly })])])),
    ).toHaveLength(1)
  })

  it('passes a page whose stylesheets use start and end', () => {
    expect(detectAll(rule, renderedEvidence([facts('chromium', [])]))).toEqual([])
  })

  it('applies to right-to-left pages whose stylesheets were read', () => {
    expect(applies(rule, renderedEvidence([facts('chromium', [])]))).toBe(true)
    expect(applies(rule, renderedEvidence([facts('chromium', [], { dir: 'ltr' })]))).toBe(false)
    expect(
      applies(
        rule,
        renderedEvidence([
          facts('chromium', [], { stylesheets: { read: 0, unread: 2, physical: [] } }),
        ]),
      ),
    ).toBe(false)
  })
})

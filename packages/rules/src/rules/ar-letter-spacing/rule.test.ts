import { describe, expect, it } from 'vitest'
import {
  applies,
  arabicBlock,
  detectAll,
  renderedEvidence,
  renderedFacts,
} from '../../../test/helpers'
import { rule } from './rule'

// The browser suite renders the wrong and right fixtures in every engine; here the detector
// reads facts as engines report them.
const spaced = (letterSpacingApplied: boolean | null, letterSpacing = 3.2) =>
  arabicBlock({ selector: 'h1', letterSpacing, letterSpacingApplied })

describe('ar-letter-spacing', () => {
  it('fires when an engine drew the spacing, naming the engines that did', () => {
    const findings = detectAll(
      rule,
      renderedEvidence([
        renderedFacts('chromium', { arabicText: [spaced(false)] }),
        renderedFacts('webkit', { arabicText: [spaced(true)] }),
      ]),
    )
    expect(findings).toEqual([
      {
        message: 'drawn',
        values: { letterSpacing: 3.2 },
        selector: 'h1',
        engines: ['webkit'],
        box: { x: 20, y: 40, width: 350, height: 24 },
      },
    ])
  })

  it('fires when the engines here ignored it but WebKit, which draws it, did not render', () => {
    const findings = detectAll(
      rule,
      renderedEvidence([
        renderedFacts('chromium', { arabicText: [spaced(false)] }),
        renderedFacts('firefox', { arabicText: [spaced(false)] }),
      ]),
    )
    expect(findings).toMatchObject([
      { message: 'webkit', selector: 'h1', engines: ['chromium', 'firefox'] },
    ])
  })

  it('passes when WebKit rendered the page and no engine drew the spacing', () => {
    expect(
      detectAll(
        rule,
        renderedEvidence([
          renderedFacts('chromium', { arabicText: [spaced(false)] }),
          renderedFacts('webkit', { arabicText: [spaced(false)] }),
        ]),
      ),
    ).toEqual([])
  })

  it('leaves negative spacing out: the letters draw closer but stay joined (M1.1 review)', () => {
    // Tailwind's tracking-tight, common on headings: -0.025em.
    expect(
      detectAll(
        rule,
        renderedEvidence([renderedFacts('webkit', { arabicText: [spaced(true, -0.8)] })]),
      ),
    ).toEqual([])
  })

  it('ignores text without spacing, and words too short to have joins', () => {
    expect(
      detectAll(
        rule,
        renderedEvidence([
          renderedFacts('chromium', {
            arabicText: [arabicBlock(), spaced(null), arabicBlock({ letterSpacing: 0 })],
          }),
        ]),
      ),
    ).toEqual([])
  })

  it('reports each element once, in document order, across engines', () => {
    const blocks = [
      spaced(true),
      arabicBlock({ selector: 'p', letterSpacing: 1, letterSpacingApplied: true }),
    ]
    const findings = detectAll(
      rule,
      renderedEvidence([
        renderedFacts('firefox', {
          arabicText: blocks.map((block) => ({ ...block, letterSpacingApplied: false })),
        }),
        renderedFacts('webkit', { arabicText: blocks }),
      ]),
    )
    expect(findings.map((finding) => [finding.selector, finding.message, finding.engines])).toEqual(
      [
        ['h1', 'drawn', ['webkit']],
        ['p', 'drawn', ['webkit']],
      ],
    )
  })

  it('applies when an engine rendered Arabic text, whatever the HTML held', () => {
    expect(applies(rule, renderedEvidence([renderedFacts()]))).toBe(true)
    expect(applies(rule, renderedEvidence([renderedFacts('chromium', { arabicText: [] })]))).toBe(
      false,
    )
  })
})

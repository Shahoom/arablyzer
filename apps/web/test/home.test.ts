import { HERO_TOOLS, HOME } from '@arablyzer/i18n'
import { Engine } from '@arablyzer/report-schema'
import { describe, expect, it } from 'vitest'
import {
  BENTO_TOOLS,
  barSpan,
  gauge,
  HERO_TOOL_SLUGS,
  homeCounts,
  joinNames,
  MARQUEE_TOOL_SLUGS,
  previewPoints,
  PREVIEW_SERIES,
  ringDash,
  scoreTone,
  SHOWN_CATEGORIES,
} from '../src/lib/home'
import { GUIDES_DATA } from '../src/lib/guide-data'
import { LIBRARY_DATA } from '../src/lib/rule-data'
import { SHOWCASE } from '../src/lib/showcase'
import { TOOLS_DATA, toolData } from '../src/lib/tool-data'

// M2.6 R2: the home page's numbers are counted from the registries and its tools are named by slug.
describe('the home page’s counts', () => {
  it('are the registries’ own lengths', () => {
    expect(homeCounts()).toEqual({
      tools: TOOLS_DATA.tools.length,
      rules: LIBRARY_DATA.rules.length,
      engines: Engine.options.length,
      guides: GUIDES_DATA.fix.length,
      terms: GUIDES_DATA.glossary.length,
    })
  })

  it('are not nothing, and are three browsers', () => {
    const counts = homeCounts()
    for (const [name, count] of Object.entries(counts)) expect(count, name).toBeGreaterThan(0)
    expect(counts.engines).toBe(3)
  })
})

describe('the tools the home page names', () => {
  const all = (slugs: readonly string[]) => slugs.map((slug) => toolData(slug).slug)

  it('are all in the registry', () => {
    expect(all(HERO_TOOL_SLUGS)).toEqual([...HERO_TOOLS])
    expect(all(MARQUEE_TOOL_SLUGS)).toHaveLength(MARQUEE_TOOL_SLUGS.length)
    expect(all(Object.values(BENTO_TOOLS))).toHaveLength(Object.keys(BENTO_TOOLS).length)
  })

  it('are named once in the marquee', () => {
    expect(new Set(MARQUEE_TOOL_SLUGS).size).toBe(MARQUEE_TOOL_SLUGS.length)
  })

  it('give each hero chip its words, in the language of the page', () => {
    for (const lang of ['ar', 'en'] as const) {
      for (const slug of HERO_TOOL_SLUGS) {
        expect(HOME[lang].hero.tools.names[slug]).toBeTruthy()
      }
    }
  })

  it('are the Arabic layer’s own checks and the WhatsApp generator in the hero', () => {
    expect([...HERO_TOOL_SLUGS]).toEqual([
      'rtl-check',
      'arabic-shaping-check',
      'arabic-font-check',
      'arabic-form-test',
      'whatsapp-link-generator',
    ])
    // The chips send people to the generator, which is a tool that takes no address.
    expect(toolData('whatsapp-link-generator').kind).toBe('generator')
  })
})

describe('the example report’s categories', () => {
  it('are each scored in the golden report the product shot reads', () => {
    for (const category of SHOWN_CATEGORIES) {
      expect(SHOWCASE.categories[category], category).toBeTypeOf('number')
    }
  })

  it('are told apart by tone: whole, partly lost, lost', () => {
    expect(
      SHOWN_CATEGORIES.map((category) => scoreTone(SHOWCASE.categories[category] ?? -1)),
    ).toEqual(['mid', 'low', 'good', 'good'])
    expect([100, 90, 89, 50, 49, 0].map(scoreTone)).toEqual([
      'good',
      'good',
      'mid',
      'mid',
      'low',
      'low',
    ])
  })
})

describe('the shapes drawn from numbers', () => {
  it('fills a ring to its score, and an empty one is empty', () => {
    expect(ringDash(91)).toBe('91 100')
    expect(ringDash(0)).toBe('0 100')
    expect(ringDash(130)).toBe('100 100')
  })

  it('starts a bar at the side the page starts on, and leaves a sliver for 0', () => {
    expect(barSpan(67, true)).toEqual({ x: 33, width: 67 })
    expect(barSpan(67, false)).toEqual({ x: 0, width: 67 })
    expect(barSpan(100, true)).toEqual({ x: 0, width: 100 })
    expect(barSpan(0, true)).toEqual({ x: 98, width: 2 })
    expect(barSpan(0, false)).toEqual({ x: 0, width: 2 })
  })

  it('fills each gauge to its share of its scale and tones it by Core Web Vitals’ thresholds', () => {
    expect(gauge('lcp')).toEqual({ fill: 52.5, tone: 'good' })
    expect(gauge('inp')).toEqual({ fill: 36, tone: 'good' })
    expect(gauge('cls')).toEqual({ fill: 48, tone: 'mid' })
  })

  it('draws the monitoring preview’s line from its oldest point, on the side the page starts', () => {
    const rtl = previewPoints(true)
    const ltr = previewPoints(false)
    expect(rtl).toHaveLength(PREVIEW_SERIES.length)
    expect([rtl[0]?.x, rtl.at(-1)?.x]).toEqual([640, 0])
    expect([ltr[0]?.x, ltr.at(-1)?.x]).toEqual([0, 640])
    expect(rtl.map((point) => point.y)).toEqual([...PREVIEW_SERIES])
  })
})

describe('joinNames', () => {
  it('joins names as each language does', () => {
    const engines = ['Chromium', 'Firefox', 'WebKit']
    expect(joinNames(engines, 'ar')).toBe('Chromium وFirefox وWebKit')
    expect(joinNames(engines, 'en')).toBe('Chromium, Firefox and WebKit')
    expect(joinNames(['WebKit'], 'ar')).toBe('WebKit')
    expect(joinNames(['Chromium', 'WebKit'], 'en')).toBe('Chromium and WebKit')
    expect(joinNames([], 'en')).toBe('')
  })
})

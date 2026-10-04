import { fileURLToPath } from 'node:url'
import { executablePathFor } from '@arablyzer/browser/engines'
import { serveSite, type FixtureSite } from '@arablyzer/fixtures'
import type { Engine } from '@arablyzer/report-schema'
import { chromium, firefox, webkit, type Browser } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The heads of the site's pages as one system (M2.6 R6, scaled in R7a). The approved artboards
// centre the home page's hero and nothing else: every other page opens with its trail, its heading
// and its lead at the start of the line. Each milestone had drawn its pages' heads alone, and the
// tool pages and the tools' directory were centred where the knowledge pages were not. After the
// owner's review (R7) there is one scale for every h1 but the home page's hero: 28 px on a phone,
// 40 px from lg, in solid ink (a gradient phrase is the home page's alone). The site's own pages on
// loopback, and every request off the site refused (eslint.config.js). `pnpm test:browser` builds
// the site first.
const DIST = fileURLToPath(new URL('../../dist/', import.meta.url))
const TYPES = { chromium, firefox, webkit } as const

/**
 * Every engine that launches here. Engines named in ARABLYZER_REQUIRE_ENGINES (CI names all
 * three) must launch, so a missing one fails the run instead of being skipped.
 */
async function enginesHere(): Promise<Engine[]> {
  const required = (process.env.ARABLYZER_REQUIRE_ENGINES ?? '').split(',').map((e) => e.trim())
  const engines: Engine[] = []
  for (const engine of ['chromium', 'firefox', 'webkit'] as const) {
    try {
      const executablePath = executablePathFor(engine)
      await (
        await TYPES[engine].launch({ ...(executablePath === undefined ? {} : { executablePath }) })
      ).close()
      engines.push(engine)
    } catch {
      if (required.includes(engine)) {
        throw new Error(`${engine} is required by ARABLYZER_REQUIRE_ENGINES but does not launch`)
      }
    }
  }
  return engines
}

const ENGINES = await enginesHere()

let site: FixtureSite
beforeAll(async () => {
  site = await serveSite(DIST, { cleanUrls: true })
})
afterAll(async () => {
  await site.close()
})

/** An index: the tools, the hub, the rule library, the fix guides, the glossary. */
const INDEXES = ['/tools', '/knowledge', '/rules', '/fix', '/glossary']
/** A page that is one thing: its name. */
const PAGES = [
  '/tools/rtl-check',
  '/tools/whatsapp-link-generator',
  '/rules/ar-letter-spacing',
  '/fix/soft-404',
  '/glossary/robots-txt',
  '/bot',
  '/methodology',
]

describe.each(ENGINES)('the heads of the pages in %s', (engine) => {
  let browser: Browser
  beforeAll(async () => {
    const executablePath = executablePathFor(engine)
    browser = await TYPES[engine].launch(executablePath === undefined ? {} : { executablePath })
  })
  afterAll(async () => {
    await browser.close()
  })

  /** The page's trail and heading: where they start, how they are set, how large. */
  async function head(path: string, width = 1440) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await context.route('**/*', async (route) => {
      if (new URL(route.request().url()).origin === site.origin) await route.fallback()
      else await route.abort('blockedbyclient')
    })
    const tab = await context.newPage()
    await tab.goto(site.url(path))
    await tab.evaluate(() => document.fonts.ready)
    const found = await tab.evaluate(() => {
      const heading = document.querySelector('main h1')
      const first = document.querySelector('main nav ol li')
      if (heading === null) return null
      const rtl = getComputedStyle(document.documentElement).direction === 'rtl'
      const box = heading.getBoundingClientRect()
      const trail = first?.getBoundingClientRect()
      const style = getComputedStyle(heading)
      // The edge each starts from: the right one in a right-to-left page.
      const edge = (rect: DOMRect) => (rtl ? rect.right : rect.left)
      // Gradient text is clipped to the letters, with a transparent fill: any such element.
      const gradient = [heading, ...heading.querySelectorAll('*')].some(
        (node) => getComputedStyle(node).webkitTextFillColor === 'rgba(0, 0, 0, 0)',
      )
      return {
        align: style.textAlign,
        size: Number.parseFloat(style.fontSize),
        weight: Number(style.fontWeight),
        headingEdge: edge(box),
        trailEdge: trail === undefined ? null : edge(trail),
        wide: box.width,
        gradient,
      }
    })
    await context.close()
    return found
  }

  it.each(['', '/en'])('centres the home page’s hero and nothing but it (%s)', async (prefix) => {
    const home = await head(`${prefix}/`)
    expect(home?.align).toBe('center')
    expect(home?.trailEdge).toBeNull()
  })

  it.each([...INDEXES, ...PAGES])(
    'opens %s at the start of the line, in both languages',
    async (path) => {
      for (const prefix of ['', '/en']) {
        const found = await head(`${prefix}${path}`)
        expect(found, `${prefix}${path}`).not.toBeNull()
        // Set at the start, not centred, and on the same edge as the trail above it.
        expect(found?.align, `${prefix}${path}`).not.toBe('center')
        expect(found?.trailEdge, `${prefix}${path}`).not.toBeNull()
        expect(
          Math.abs((found?.headingEdge ?? 0) - (found?.trailEdge ?? 1e6)),
          `${prefix}${path} starts where its trail starts`,
        ).toBeLessThanOrEqual(1)
      }
    },
    60_000,
  )

  // The fonts a page opens with are preloaded on every page: DM Sans' two weights, which draw the
  // Latin letters of its first screen, and on an Arabic page Plex Arabic's two. R5 had asked for
  // it on its own pages; with the fonts held back 600 ms, as a slow network holds them, the other
  // Arabic pages moved by 0.0004 to 0.005, and by 0.0001 with the preload (M2.6 R6).
  it.each(['/', '/tools', '/tools/rtl-check', '/knowledge', '/rules/ar-letter-spacing', '/r/'])(
    'preloads the fonts the first screen of %s needs, in both languages',
    async (path) => {
      for (const [prefix, count] of [
        ['', 4],
        ['/en', 2],
      ] as const) {
        const context = await browser.newContext()
        const tab = await context.newPage()
        await tab.route('**/*', async (route) => {
          if (new URL(route.request().url()).origin === site.origin) await route.fallback()
          else await route.abort('blockedbyclient')
        })
        await tab.goto(site.url(`${prefix}${path}`))
        expect(
          await tab.locator('link[rel="preload"][as="font"]').count(),
          `${prefix}${path}`,
        ).toBe(count)
        await context.close()
      }
    },
    60_000,
  )

  // One scale for every h1 but the home page's: an index and a page that is one thing alike.
  it.each([...INDEXES, ...PAGES])(
    'draws the heading of %s at 40 px on a desktop and 28 px on a phone, in solid ink',
    async (path) => {
      for (const prefix of ['', '/en']) {
        const desktop = await head(`${prefix}${path}`)
        expect(desktop?.size, `${prefix}${path} at 1440`).toBe(40)
        expect(desktop?.weight, `${prefix}${path} weight`).toBe(600)
        expect(desktop?.gradient, `${prefix}${path} has no gradient`).toBe(false)
        const phone = await head(`${prefix}${path}`, 390)
        expect(phone?.size, `${prefix}${path} at 390`).toBe(28)
        expect(phone?.gradient, `${prefix}${path} at 390 has no gradient`).toBe(false)
      }
    },
    60_000,
  )

  it.each(['', '/en'])(
    'keeps the one gradient phrase in the home page’s heading (%s)',
    async (prefix) => {
      expect((await head(`${prefix}/`))?.gradient).toBe(true)
    },
  )
})

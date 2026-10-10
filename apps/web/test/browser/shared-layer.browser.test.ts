import { fileURLToPath } from 'node:url'
import { executablePathFor } from '@arablyzer/browser/engines'
import { serveSite, type FixtureSite } from '@arablyzer/fixtures'
import { SITE } from '@arablyzer/i18n'
import type { Engine } from '@arablyzer/report-schema'
import { chromium, firefox, webkit, type Browser, type Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// The shared layer of the owner's review (M2.6 R7a), as a visitor meets it: one header row at
// every width with a menu sheet below lg, the scale of gutters, sections, cards and chips, the
// two columns of an inner page, a plain box where the turning ring was, the aurora only behind the
// home page's hero, no icon squares before a heading, a one-line trail and a compact footer. The
// site's own pages on loopback, and every request off the site refused (eslint.config.js).
// `pnpm test:browser` builds the site first.
const DIST = fileURLToPath(new URL('../../dist/', import.meta.url))
const TYPES = { chromium, firefox, webkit } as const

// A browser starts, and a page loads, in the time a busy runner gives it: the default five seconds
// are for tests that do not drive one.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

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

const LANGS = ['ar', 'en'] as const
const prefixOf = (lang: (typeof LANGS)[number]) => (lang === 'ar' ? '' : '/en')
/** The header's sections, in order, as NAV lists them (apps/web/src/lib/site.ts). */
const SECTIONS = ['/tools', '/knowledge', '/rules', '/fix', '/blog']
/** Below lg the header has a menu; from lg it has the sections. */
const BELOW_LG = [320, 360, 390, 768, 1023]
const FROM_LG = [1024, 1440]

describe.each(ENGINES)('the shared layer in %s', (engine) => {
  let browser: Browser
  beforeAll(async () => {
    const executablePath = executablePathFor(engine)
    browser = await TYPES[engine].launch(executablePath === undefined ? {} : { executablePath })
  })
  afterAll(async () => {
    await browser.close()
  })

  /** A page of the site at a width, every request off the site refused, its fonts loaded. */
  async function open(path: string, width: number, height = 900): Promise<Page> {
    const context = await browser.newContext({ viewport: { width, height } })
    await context.route('**/*', async (route) => {
      if (new URL(route.request().url()).origin === site.origin) await route.fallback()
      else await route.abort('blockedbyclient')
    })
    const tab = await context.newPage()
    await tab.goto(site.url(path))
    await tab.evaluate(() => document.fonts.ready)
    return tab
  }
  const done = async (tab: Page) => {
    await tab.context().close()
  }

  describe('the header', () => {
    it.each(['/tools/rtl-check', '/knowledge', '/'])(
      'is one row of 56 px below lg, with a menu button and no scan button in the bar (%s)',
      async (path) => {
        for (const lang of LANGS) {
          for (const width of BELOW_LG) {
            const tab = await open(`${prefixOf(lang)}${path}`, width)
            const found = await tab.evaluate(() => {
              const header = document.querySelector('header')
              if (header === null) return null
              const summary = header.querySelector('summary')
              if (summary === null) return null
              const bar = header.getBoundingClientRect()
              const inside = [
                header.querySelector('a[aria-label]'),
                header.querySelector('a[hreflang]'),
                summary,
              ].map((node) => {
                if (node === null) return false
                const box = node.getBoundingClientRect()
                return box.top >= bar.top - 0.5 && box.bottom <= bar.bottom + 0.5
              })
              const box = summary.getBoundingClientRect()
              return {
                height: bar.height,
                sticky: getComputedStyle(header).position,
                inside,
                menu: [box.width, box.height],
                name: summary.textContent.trim(),
                // A scan button drawn in the bar: the one in the closed sheet is not drawn.
                scans: [...header.querySelectorAll('.btn-grad')].filter((node) =>
                  node.checkVisibility(),
                ).length,
                sections: document.querySelector('header > div > nav')?.checkVisibility(),
              }
            })
            const where = `${lang} ${path} at ${width}`
            expect(found, where).not.toBeNull()
            expect(found?.height, `${where}: the bar`).toBe(56)
            expect(found?.sticky, where).toBe('sticky')
            expect(found?.inside, `${where}: logo, language link and menu share the row`).toEqual([
              true,
              true,
              true,
            ])
            expect(found?.menu, `${where}: the menu button`).toEqual([44, 44])
            expect(found?.name, `${where}: its name`).toBe(SITE[lang].menu)
            expect(found?.scans, `${where}: no scan button in the bar`).toBe(0)
            expect(found?.sections, `${where}: the sections are in the sheet`).toBe(false)
            await done(tab)
          }
        }
      },
      120_000,
    )

    it.each(['/tools/rtl-check', '/knowledge', '/'])(
      'opens a sheet as wide as the screen with the sections and the scan button (%s)',
      async (path) => {
        for (const lang of LANGS) {
          for (const width of [320, 390, 768]) {
            const tab = await open(`${prefixOf(lang)}${path}`, width)
            await tab.click('header summary')
            const sheet = await tab.evaluate(() => {
              const panel = document.querySelector('header details > div')
              if (panel === null) return null
              const box = panel.getBoundingClientRect()
              const links = [...panel.querySelectorAll('nav a')]
              const scan = panel.querySelector('.btn-grad')
              return {
                open: document.querySelector('header details')?.hasAttribute('open'),
                box: [box.left, box.width, box.top],
                hrefs: links.map((link) => link.getAttribute('href')),
                current: links.map((link) => link.getAttribute('aria-current')),
                rows: links.map((link) => link.getBoundingClientRect().height),
                scan:
                  scan === null
                    ? null
                    : [
                        scan.getAttribute('href'),
                        scan.getBoundingClientRect().height,
                        scan.textContent.trim(),
                      ],
                scrollW: document.documentElement.scrollWidth,
                clientW: document.documentElement.clientWidth,
              }
            })
            const where = `${lang} ${path} at ${width}`
            expect(sheet?.open, where).toBe(true)
            // The width of the screen, under the bar.
            expect(sheet?.box[0], `${where}: left edge`).toBe(0)
            expect(sheet?.box[1], `${where}: width`).toBe(width)
            expect(sheet?.box[2], `${where}: under the 56 px bar`).toBe(56)
            expect(sheet?.hrefs, `${where}: the sections`).toEqual(
              SECTIONS.map((section) => `${prefixOf(lang)}${section}`),
            )
            // The current section is marked: a tool is under the tools, the hub is its own page.
            const current = SECTIONS.map((section) =>
              path === section ? 'page' : path.startsWith(`${section}/`) ? 'true' : null,
            )
            expect(sheet?.current, `${where}: aria-current`).toEqual(current)
            for (const row of sheet?.rows ?? []) expect(row).toBe(48)
            if (path === '/') {
              // On the home page the button would only jump within the page, and the sheet
              // would stay open over the scan box: the sheet lists the sections alone.
              expect(sheet?.scan, `${where}: no scan button on the home page`).toBeNull()
            } else {
              expect(sheet?.scan?.[0], where).toBe(`${prefixOf(lang)}/#scan`)
              expect(sheet?.scan?.[1], `${where}: the primary button`).toBe(48)
              expect(sheet?.scan?.[2], where).toBe(SITE[lang].scanCta)
            }
            expect(sheet?.scrollW, `${where}: no sideways scroll`).toBe(sheet?.clientW)
            await done(tab)
          }
        }
      },
      120_000,
    )

    it('is one row of 64 px from lg, with the sections and a 40 px scan button', async () => {
      for (const lang of LANGS) {
        for (const width of FROM_LG) {
          const tab = await open(`${prefixOf(lang)}/tools/rtl-check`, width)
          const found = await tab.evaluate(() => {
            const header = document.querySelector('header')
            if (header === null) return null
            const bar = header.getBoundingClientRect()
            const links = [...header.querySelectorAll(':scope > div > nav a')]
            const scan = header.querySelector(':scope > div > div > .btn-grad')
            const language = header.querySelector('a[hreflang]')
            const row = [header.querySelector('a[aria-label]'), language, scan, ...links].map(
              (node) => {
                const box = node?.getBoundingClientRect()
                return box !== undefined && box.top >= bar.top && box.bottom <= bar.bottom
              },
            )
            return {
              height: bar.height,
              sticky: getComputedStyle(header).position,
              row,
              links: links.length,
              current: links.map((link) => link.getAttribute('aria-current')),
              scan: scan?.getBoundingClientRect().height,
              menu: header.querySelector('summary')?.checkVisibility(),
              language: [
                language?.getAttribute('lang'),
                language?.getAttribute('hreflang'),
                language?.getAttribute('aria-label'),
              ],
            }
          })
          const where = `${lang} at ${width}`
          expect(found?.height, `${where}: the bar`).toBe(64)
          expect(found?.sticky, where).toBe('sticky')
          expect(found?.row.every(Boolean), `${where}: one row`).toBe(true)
          expect(found?.links, `${where}: the sections`).toBe(SECTIONS.length)
          expect(found?.current, `${where}: the tools' section is marked`).toEqual([
            'true',
            ...SECTIONS.slice(1).map(() => null),
          ])
          expect(found?.scan, `${where}: the small scan button`).toBe(40)
          expect(found?.menu, `${where}: no menu button`).toBe(false)
          const other = lang === 'ar' ? 'en' : 'ar'
          expect(found?.language, `${where}: the language link`).toEqual([
            other,
            other,
            SITE[lang].otherLang.label,
          ])
          await done(tab)
        }
      }
    }, 120_000)

    it('stays at the top while the page scrolls', async () => {
      for (const width of [390, 1440]) {
        const tab = await open('/bot', width)
        await tab.evaluate(() => {
          window.scrollTo(0, 900)
        })
        await tab.waitForTimeout(100)
        const top = await tab.evaluate(
          () => document.querySelector('header')?.getBoundingClientRect().top,
        )
        expect(top, `at ${width}`).toBe(0)
        await done(tab)
      }
    })
  })

  describe('the scale', () => {
    it('steps the gutter, the sections, the cards and the header at md and lg', async () => {
      const expected: Record<number, Record<string, string>> = {
        390: {
          '--gutter': '16px',
          '--section-gap': '40px',
          '--card-pad': '16px',
          '--card-radius': '16px',
          '--header-h': '56px',
        },
        768: {
          '--gutter': '24px',
          '--section-gap': '56px',
          '--card-pad': '24px',
          '--card-radius': '20px',
          '--header-h': '56px',
        },
        1440: {
          '--gutter': '32px',
          '--section-gap': '72px',
          '--card-pad': '24px',
          '--card-radius': '20px',
          '--header-h': '64px',
        },
      }
      for (const [width, variables] of Object.entries(expected)) {
        const tab = await open('/bot', Number(width))
        const found = await tab.evaluate((names) => {
          const root = getComputedStyle(document.documentElement)
          const wrap = document.querySelector('main .wrap')
          const style = wrap === null ? null : getComputedStyle(wrap)
          return {
            variables: Object.fromEntries(
              names.map((name) => [name, root.getPropertyValue(name).trim()]),
            ),
            padding: [style?.paddingLeft, style?.paddingRight],
            max: wrap?.getBoundingClientRect().width,
          }
        }, Object.keys(variables))
        expect(found.variables, `at ${width}`).toEqual(variables)
        // `wrap` is the gutter on each side of up to 1200 px of content.
        expect(found.padding, `at ${width}: wrap`).toEqual([
          variables['--gutter'],
          variables['--gutter'],
        ])
        const gutter = Number.parseFloat(variables['--gutter'] ?? '0')
        expect(found.max, `at ${width}: wrap width`).toBe(
          Math.min(Number(width), 1200 + 2 * gutter),
        )
        await done(tab)
      }
    })

    it('sets body text at 16 px, with Arabic’s leading and the Latin one', async () => {
      for (const [lang, leading] of [
        ['ar', 28],
        ['en', 25.6],
      ] as const) {
        const tab = await open(`${prefixOf(lang)}/bot`, 390)
        const body = await tab.evaluate(() => {
          const style = getComputedStyle(document.body)
          return [style.fontSize, style.lineHeight]
        })
        expect(body, lang).toEqual(['16px', `${leading}px`])
        await done(tab)
      }
    })

    it('draws a chip 40 px tall on a phone and 36 px from md, in 14 px type', async () => {
      for (const [width, height] of [
        [390, 40],
        [1440, 36],
      ] as const) {
        const tab = await open('/', width)
        const chip = await tab.evaluate(() => {
          const node = document.querySelector('.chip')
          if (node === null) return null
          return [node.getBoundingClientRect().height, getComputedStyle(node).fontSize]
        })
        expect(chip, `at ${width}`).toEqual([height, '14px'])
        await done(tab)
      }
    })

    it.skipIf(engine !== 'chromium')(
      'has no sideways scroll at 320, 360 and 390 px, with the sheet open or shut',
      async () => {
        const pages = [
          '/',
          '/tools',
          '/tools/rtl-check',
          '/knowledge',
          '/rules',
          '/rules/ar-letter-spacing',
          '/fix',
          '/fix/soft-404',
          '/glossary',
          '/glossary/robots-txt',
          '/bot',
          '/methodology',
        ]
        for (const lang of LANGS) {
          for (const path of pages) {
            for (const width of [320, 360, 390]) {
              const tab = await open(`${prefixOf(lang)}${path}`, width, 800)
              const shut = await tab.evaluate(() => [
                document.documentElement.scrollWidth,
                document.documentElement.clientWidth,
              ])
              expect(shut[0], `${lang}${path} at ${width}`).toBe(shut[1])
              await tab.click('header summary')
              const opened = await tab.evaluate(() => [
                document.documentElement.scrollWidth,
                document.documentElement.clientWidth,
              ])
              expect(opened[0], `${lang}${path} at ${width}, the sheet open`).toBe(opened[1])
              await done(tab)
            }
          }
        }
      },
      180_000,
    )
  })

  describe('the two columns of an inner page', () => {
    // The pages on PageColumns (DocPage): the bot's page, the methodology, a fix guide and a
    // glossary term. On a phone each has its contents as a disclosure under its head (M2.6 R7), and
    // its aside, the contents list and the links to more, comes after the text.
    const STICKY = ['/bot', '/methodology']
    const AFTER = ['/bot', '/methodology', '/fix/soft-404', '/glossary/robots-txt']

    /** The main column and the aside of the page: where each is. */
    async function columns(tab: Page) {
      return tab.evaluate(() => {
        const main = document.querySelector('.page-main')
        const aside = document.querySelector('.page-aside')
        if (main === null || aside === null) return null
        const a = main.getBoundingClientRect()
        const b = aside.getBoundingClientRect()
        const rtl = getComputedStyle(document.documentElement).direction === 'rtl'
        return {
          rtl,
          main: { left: a.left, right: a.right, top: a.top, width: a.width },
          aside: { left: b.left, right: b.right, top: b.top, width: b.width },
          position: getComputedStyle(aside).position,
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
        }
      })
    }

    it.each(AFTER)(
      'is a main column of 760 px at the most beside an aside of 320 to 360 px from lg (%s)',
      async (path) => {
        for (const lang of LANGS) {
          const tab = await open(`${prefixOf(lang)}${path}`, 1440)
          const found = await columns(tab)
          const where = `${lang}${path}`
          expect(found, where).not.toBeNull()
          if (found === null) continue
          expect(found.main.width, `${where}: main`).toBeLessThanOrEqual(760.5)
          expect(found.main.width, `${where}: main is wide enough to read`).toBeGreaterThan(560)
          expect(found.aside.width, `${where}: aside`).toBeGreaterThanOrEqual(319.5)
          expect(found.aside.width, `${where}: aside`).toBeLessThanOrEqual(368.5)
          // The main column is where the line starts, the aside where it ends.
          if (found.rtl) expect(found.main.right, where).toBeGreaterThan(found.aside.right)
          else expect(found.main.left, where).toBeLessThan(found.aside.left)
          // 1200 px of content, whatever the screen.
          const span =
            Math.max(found.main.right, found.aside.right) -
            Math.min(found.main.left, found.aside.left)
          expect(span, `${where}: the content`).toBeLessThanOrEqual(1208.5)
          expect(found.position, `${where}: the aside sticks`).toBe('sticky')
          await done(tab)
        }
      },
      60_000,
    )

    it.each(STICKY)('sticks 24 px under the header while the text scrolls (%s)', async (path) => {
      const tab = await open(path, 1440)
      await tab.evaluate(() => {
        window.scrollTo(0, 900)
      })
      await tab.waitForTimeout(150)
      const top = await tab.evaluate(
        () => document.querySelector('.page-aside')?.getBoundingClientRect().top ?? null,
      )
      // The header is 64 px; the aside's own 4 px of padding is pulled back by its margin.
      expect(top).not.toBeNull()
      expect(top ?? 0).toBeGreaterThanOrEqual(84 - 1)
      expect(top ?? 0).toBeLessThanOrEqual(88 + 1)
      await done(tab)
    })

    it.each(AFTER)(
      'is one column below lg (%s)',
      async (path) => {
        for (const lang of LANGS) {
          for (const width of [320, 390, 768, 1023]) {
            const tab = await open(`${prefixOf(lang)}${path}`, width)
            const found = await columns(tab)
            const where = `${lang}${path} at ${width}`
            expect(found, where).not.toBeNull()
            if (found === null) continue
            expect(
              Math.abs(found.main.left - found.aside.left),
              `${where}: same edge`,
            ).toBeLessThan(1)
            expect(
              Math.abs(found.main.width - found.aside.width),
              `${where}: same width`,
            ).toBeLessThan(1)
            // Links to more come after the text.
            expect(found.aside.top, where).toBeGreaterThan(found.main.top)
            expect(found.position, `${where}: not sticky`).toBe('static')
            expect(found.scrollW, where).toBe(found.clientW)
            await done(tab)
          }
        }
      },
      120_000,
    )
  })

  describe('the pages as a system', () => {
    // The turning ring and the glow are the home page's scan box alone, and so is the aurora.
    const INNER = [
      '/tools',
      '/tools/rtl-check',
      '/tools/whatsapp-link-generator',
      '/knowledge',
      '/rules',
      '/rules/ar-letter-spacing',
      '/fix',
      '/fix/soft-404',
      '/glossary',
      '/glossary/robots-txt',
      '/bot',
      '/methodology',
      '/404',
    ]

    it.skipIf(engine !== 'chromium')(
      'has the aurora and the ring on the home page and on no other',
      async () => {
        for (const lang of LANGS) {
          const home = await open(`${prefixOf(lang)}/`, 1440)
          expect(await home.locator('.aurora').count(), `${lang} home aurora`).toBe(1)
          expect(await home.locator('.scan-ring').count(), `${lang} home ring`).toBe(1)
          await done(home)
          for (const path of INNER) {
            const tab = await open(`${prefixOf(lang)}${path}`, 1440)
            // A tool's box is an island that starts when the browser is idle: let it.
            if (path.startsWith('/tools/')) await tab.waitForTimeout(900)
            expect(await tab.locator('.aurora').count(), `${lang}${path} aurora`).toBe(0)
            expect(await tab.locator('.scan-ring').count(), `${lang}${path} ring`).toBe(0)
            await done(tab)
          }
        }
      },
      180_000,
    )

    it('draws a tool’s box plain: a 1 px border, a shadow, and no animation', async () => {
      for (const path of ['/tools/rtl-check', '/tools/whatsapp-link-generator']) {
        const tab = await open(path, 1440)
        await tab.waitForSelector('.scan-box')
        const box = await tab.evaluate(() => {
          const node = document.querySelector('.scan-box')
          if (node === null) return null
          const style = getComputedStyle(node)
          return {
            border: style.borderTopWidth,
            shadow: style.boxShadow !== 'none',
            animated: [node, ...node.querySelectorAll('*')].some(
              (child) => getComputedStyle(child).animationName !== 'none',
            ),
          }
        })
        expect(box, path).toEqual({ border: '1px', shadow: true, animated: false })
        await done(tab)
      }
    })

    // Where a section's heading is a shared component (ToolSection, DocHeading): the other pages
    // draw their own group headings (the directories', the hub's) and have their agents' say.
    const SECTIONED = [
      '/tools/rtl-check',
      '/tools/whatsapp-link-generator',
      '/rules/ar-letter-spacing',
      '/fix/soft-404',
      '/glossary/robots-txt',
      '/bot',
      '/methodology',
    ]

    it.skipIf(engine !== 'chromium')(
      'has no gradient in any heading but the home page’s, and no icon before a section’s',
      async () => {
        for (const path of INNER.filter((p) => p !== '/404')) {
          for (const lang of LANGS) {
            const tab = await open(`${prefixOf(lang)}${path}`, 390)
            const found = await tab.evaluate((sectioned) => {
              const headings = [...document.querySelectorAll('main h1, main h2, main h3')]
              const gradient = headings.filter((heading) =>
                [heading, ...heading.querySelectorAll('*')].some(
                  (node) => getComputedStyle(node).webkitTextFillColor === 'rgba(0, 0, 0, 0)',
                ),
              )
              // What stands before an h2: nothing, or its number (a decoration with no fill and no icon).
              const squares = headings
                .filter((heading) => heading.tagName === 'H2' && sectioned)
                .filter((heading) => {
                  const before = heading.previousElementSibling
                  if (before === null) return false
                  const style = getComputedStyle(before)
                  return (
                    before.querySelector('svg') !== null ||
                    style.backgroundColor !== 'rgba(0, 0, 0, 0)'
                  )
                })
              return {
                gradient: gradient.map((heading) => heading.textContent.trim().slice(0, 30)),
                squares: squares.map((heading) => heading.textContent.trim().slice(0, 30)),
              }
            }, SECTIONED.includes(path))
            expect(found.gradient, `${lang}${path}: gradient headings`).toEqual([])
            expect(
              found.squares,
              `${lang}${path}: a coloured square or an icon before an h2`,
            ).toEqual([])
            await done(tab)
          }
        }
      },
      180_000,
    )

    it('keeps the trail to one line, and leaves the current page to the heading on a phone', async () => {
      const read = (tab: Page) =>
        tab.evaluate(() => {
          const list = document.querySelector('main nav ol')
          const current = list?.querySelector('[aria-current="page"]')
          return {
            height: list?.getBoundingClientRect().height ?? 0,
            current: current?.checkVisibility() ?? null,
            overflow: list === null ? 0 : list.scrollWidth - list.clientWidth,
          }
        })
      for (const lang of LANGS) {
        const phone = await read(await open(`${prefixOf(lang)}/tools/rtl-check`, 390))
        // One line of 13 px type, a little over 21 px with its leading.
        expect(phone.height, `${lang} tool at 390`).toBeLessThan(30)
        expect(phone.current, `${lang} tool at 390: the current page is the heading's`).toBe(false)
        expect(phone.overflow).toBeLessThanOrEqual(0)
        const desktop = await read(await open(`${prefixOf(lang)}/tools/rtl-check`, 1440))
        expect(desktop.height, `${lang} tool at 1440`).toBeLessThan(30)
        expect(desktop.current, `${lang} tool at 1440`).toBe(true)
        // An index has no steps: its trail keeps its own name.
        const index = await read(await open(`${prefixOf(lang)}/tools`, 390))
        expect(index.current, `${lang} index at 390`).toBe(true)
        expect(index.height).toBeLessThan(30)
      }
    }, 60_000)

    it('sets the footer in two columns on a phone and four on a desktop', async () => {
      for (const [width, columns] of [
        [390, 2],
        [1440, 4],
      ] as const) {
        const tab = await open('/bot', width)
        const found = await tab.evaluate(() => {
          const nav = document.querySelector('footer nav')
          if (nav === null) return null
          return {
            // The columns of links, counted by where the groups start (Firefox reports the
            // specified `repeat(2, …)`, not its tracks).
            tracks: new Set(
              [...nav.children].map((group) => Math.round(group.getBoundingClientRect().left)),
            ).size,
            targets: [...nav.querySelectorAll('a')].map(
              (link) => link.getBoundingClientRect().height,
            ),
            small: getComputedStyle(nav.querySelector('a') ?? nav).fontSize,
          }
        })
        expect(found?.tracks, `at ${width}`).toBe(columns)
        if (width === 390) {
          // WCAG 2.2 asks for 24 px targets: a compact footer keeps to it. (A desktop's links are
          // 20 px high and 10 px apart, which that criterion allows too, by their spacing.)
          for (const target of found?.targets ?? []) expect(target).toBeGreaterThanOrEqual(24)
          expect(found?.small).toBe('13px')
        }
        await done(tab)
      }
    })
  })
})

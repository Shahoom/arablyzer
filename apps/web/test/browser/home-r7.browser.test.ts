import { fileURLToPath } from 'node:url'
import { executablePathFor } from '@arablyzer/browser/engines'
import { serveSite, type FixtureSite } from '@arablyzer/fixtures'
import { HOME } from '@arablyzer/i18n'
import type { Engine } from '@arablyzer/report-schema'
import { chromium, firefox, webkit, type Browser, type Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// The home page after the owner's review (M2.6 R7, "home"): a compact page on a phone and the
// lively one on a desktop. The hero's sizes, the marquee as one row (a scroll-row under reduced
// motion), the counts as tiles, the product shot's short version, the bento as a list, every
// section heading on the scale, no card inside a card, the phone page's height, no sideways
// scroll, and the contrast of the whole page from its pixels. The site's own pages on loopback,
// and every request off the site refused (eslint.config.js). `pnpm test:browser` builds the site
// first.
const DIST = fileURLToPath(new URL('../../dist/', import.meta.url))
const TYPES = { chromium, firefox, webkit } as const

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
type Lang = (typeof LANGS)[number]
const prefixOf = (lang: Lang) => (lang === 'ar' ? '' : '/en')

interface Options {
  readonly reduced?: boolean
  readonly height?: number
  /**
   * Lays out every section: `content-visibility: auto` leaves a section below the screen at the
   * browser's placeholder height until it is near, and a page's height is measured by its layout.
   */
  readonly flat?: boolean
}

describe.each(ENGINES)('the home page in %s', (engine) => {
  let browser: Browser
  beforeAll(async () => {
    const executablePath = executablePathFor(engine)
    browser = await TYPES[engine].launch(executablePath === undefined ? {} : { executablePath })
  })
  afterAll(async () => {
    await browser.close()
  })

  /** The home page at a width, every request off the site refused, its fonts loaded. */
  async function open(lang: Lang, width: number, options: Options = {}): Promise<Page> {
    const context = await browser.newContext({
      viewport: { width, height: options.height ?? (width < 600 ? 844 : 900) },
      ...(options.reduced === true ? { reducedMotion: 'reduce' as const } : {}),
      ...(options.flat === true ? { bypassCSP: true } : {}),
    })
    await context.route('**/*', async (route) => {
      if (new URL(route.request().url()).origin === site.origin) await route.fallback()
      else await route.abort('blockedbyclient')
    })
    const tab = await context.newPage()
    await tab.goto(site.url(`${prefixOf(lang)}/`))
    if (options.flat === true) {
      await tab.addStyleTag({ content: '*{content-visibility:visible!important}' })
    }
    await tab.evaluate(() => document.fonts.ready)
    return tab
  }
  const done = async (tab: Page) => {
    await tab.context().close()
  }

  describe('the hero', () => {
    it('sets the heading at 32 px on a phone, 44 on a tablet and 60 on a desktop, with its one gradient phrase', async () => {
      for (const lang of LANGS) {
        for (const [width, size] of [
          [390, 32],
          [768, 44],
          [1440, 60],
        ] as const) {
          const tab = await open(lang, width)
          const heading = await tab.evaluate(() => {
            const node = document.querySelector('main h1')
            if (node === null) return null
            const style = getComputedStyle(node)
            return {
              size: Number.parseFloat(style.fontSize),
              weight: Number(style.fontWeight),
              gradient: [...node.querySelectorAll('*')]
                .filter(
                  (child) => getComputedStyle(child).webkitTextFillColor === 'rgba(0, 0, 0, 0)',
                )
                .map((child) => child.textContent.trim()),
            }
          })
          const where = `${lang} at ${width}`
          expect(heading?.size, where).toBe(size)
          expect(heading?.weight, where).toBe(600)
          expect(heading?.gradient, `${where}: the one gradient phrase`).toEqual([
            HOME[lang].hero.titleMark,
          ])
          await done(tab)
        }
      }
    })

    it('keeps the lead to two lines of 16 px on a phone', async () => {
      for (const lang of LANGS) {
        const tab = await open(lang, 390)
        const lead = await tab.evaluate(() => {
          const node = document.querySelector('#home-title ~ p')
          if (node === null) return null
          const style = getComputedStyle(node)
          return {
            size: Number.parseFloat(style.fontSize),
            lines: Math.round(
              node.getBoundingClientRect().height / Number.parseFloat(style.lineHeight),
            ),
          }
        })
        expect(lead?.size, lang).toBe(16)
        expect(lead?.lines, `${lang}: lines`).toBeLessThanOrEqual(2)
        await done(tab)
      }
    })

    it('has the scan box, its button and the tool chips on a phone’s first screen', async () => {
      for (const lang of LANGS) {
        const tab = await open(lang, 390)
        const first = await tab.evaluate(() => {
          const box = document.querySelector('#scan')?.getBoundingClientRect()
          const button = document
            .querySelector('#scan button[type="submit"]')
            ?.getBoundingClientRect()
          const chips = document.querySelector('main ul.scroll-row')?.getBoundingClientRect()
          const field = document.querySelector('#home-url')?.getBoundingClientRect()
          return {
            box: box?.bottom,
            button: [button?.width, button?.height],
            field: field?.height,
            chips: chips?.bottom,
            sheet: window.innerHeight,
          }
        })
        expect(first.box, `${lang}: the box ends on the first screen`).toBeLessThanOrEqual(
          first.sheet,
        )
        expect(first.chips, `${lang}: and the chips under it`).toBeLessThanOrEqual(first.sheet)
        // The primary button is 48 px high and the width of the box's content.
        expect(first.button[1], lang).toBe(48)
        expect(first.button[0], lang).toBeGreaterThan(300)
        expect(first.field, `${lang}: the field`).toBeGreaterThanOrEqual(40)
        await done(tab)
      }
    })

    it('lays the tools out as one row that scrolls on a phone, three over three on a tablet, and one row from xl', async () => {
      for (const lang of LANGS) {
        const read = (tab: Page) =>
          tab.evaluate(() => {
            const row = document.querySelector('main ul.scroll-row')
            if (row === null) return null
            const style = getComputedStyle(row)
            const tops = new Set(
              [...row.children].map((li) => Math.round(li.getBoundingClientRect().top)),
            )
            return {
              overflowX: style.overflowX,
              scrolls: row.scrollWidth > row.clientWidth,
              rows: tops.size,
              items: row.children.length,
            }
          })
        const phone = await open(lang, 390)
        expect(await read(phone), `${lang} at 390`).toEqual({
          overflowX: 'auto',
          scrolls: true,
          rows: 1,
          items: 6,
        })
        await done(phone)
        for (const width of [768, 1024]) {
          const tablet = await open(lang, width)
          // Three and three, never five and one.
          expect((await read(tablet))?.rows, `${lang} at ${width}`).toBe(2)
          await done(tablet)
        }
        const desktop = await open(lang, 1440)
        expect((await read(desktop))?.rows, `${lang} at 1440`).toBe(1)
        await done(desktop)
      }
    })

    it('makes the badge a 44 px target by its pseudo-element, in a 32 px pill', async () => {
      const tab = await open('ar', 390)
      const badge = await tab.evaluate(() => {
        const link = document.querySelector('#home-title')?.parentElement?.querySelector('a')
        if (link === null || link === undefined) return null
        const after = getComputedStyle(link, '::after')
        return {
          height: link.getBoundingClientRect().height,
          reach: Number.parseFloat(after.height),
          position: after.position,
        }
      })
      expect(badge?.height).toBe(32)
      expect(badge?.position).toBe('absolute')
      expect(badge?.reach).toBeGreaterThanOrEqual(44)
      await done(tab)
    })
  })

  describe('the marquee', () => {
    const read = (tab: Page) =>
      tab.evaluate(() => {
        const viewport = document.querySelector('#marquee-label + div')
        const track = viewport?.querySelector('ul') ?? null
        if (viewport === null || track === null) return null
        const style = getComputedStyle(viewport)
        const chips = [...track.children].filter((li) => li.checkVisibility())
        const tops = new Set(chips.map((li) => Math.round(li.getBoundingClientRect().top)))
        return {
          overflowX: style.overflowX,
          scrolls: viewport.scrollWidth > viewport.clientWidth,
          masked: style.maskImage !== 'none',
          rows: tops.size,
          chips: chips.length,
          chipHeight: chips[0]?.getBoundingClientRect().height,
          fontSize: chips[0] === undefined ? '' : getComputedStyle(chips[0]).fontSize,
          running: document
            .getAnimations()
            .filter((a) => a instanceof CSSAnimation && a.playState === 'running')
            .map((a) => (a as CSSAnimation).animationName),
          tabindex: viewport.getAttribute('tabindex'),
          page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }
      })

    it('is one compact row that slides, its ends faded, with motion', async () => {
      for (const [width, height] of [
        [390, 40],
        [1440, 36],
      ] as const) {
        const tab = await open('ar', width)
        const row = await read(tab)
        const where = `at ${width}`
        expect(row?.rows, where).toBe(1)
        expect(row?.overflowX, where).toBe('hidden')
        expect(row?.masked, where).toBe(true)
        expect(row?.running, `${where}: it slides`).toContain('home-marquee')
        // The names twice, the copy that makes the loop seamless included.
        expect(row?.chips, where).toBe(32)
        expect([row?.chipHeight, row?.fontSize], where).toEqual([height, '14px'])
        await done(tab)
      }
    })

    it('is one row that scrolls sideways, with an edge fade and no slide, under reduced motion', async () => {
      for (const lang of LANGS) {
        for (const width of [390, 768, 1440]) {
          const tab = await open(lang, width, { reduced: true })
          const row = await read(tab)
          const where = `${lang} at ${width}`
          // Never a wall: one line of the sixteen names, wider than the screen, which scrolls.
          expect(row?.rows, `${where}: one row`).toBe(1)
          expect(row?.chips, `${where}: the names once`).toBe(16)
          expect(row?.overflowX, where).toBe('auto')
          expect(row?.scrolls, `${where}: it scrolls`).toBe(true)
          expect(row?.masked, `${where}: its end fades`).toBe(true)
          expect(row?.running, `${where}: nothing slides`).toEqual([])
          // A row that scrolls is a stop of the Tab key, so that the arrow keys can reach it.
          expect(row?.tabindex, where).toBe('0')
          expect(row?.page, `${where}: the page does not scroll for it`).toBe(0)
          await done(tab)
        }
      }
    })

    it('pauses while it has focus', async () => {
      const tab = await open('ar', 390)
      await tab.focus('#marquee-label + div')
      const state = await tab.evaluate(
        () => document.querySelector('#marquee-label + div ul')?.getAnimations()[0]?.playState,
      )
      expect(state).toBe('paused')
      await done(tab)
    })
  })

  describe('the counts', () => {
    const read = (tab: Page, label: string) =>
      tab.evaluate((name) => {
        const section = document.querySelector(`section[aria-label="${name}"]`)
        if (section === null) return null
        const tiles = [...section.querySelectorAll('li')]
        const boxes = tiles.map((tile) => tile.getBoundingClientRect())
        const first = boxes[0]
        const number = section.querySelector('b')
        return {
          count: tiles.length,
          columns: new Set(boxes.map((box) => Math.round(box.left))).size,
          firstRow: boxes.filter((box) => Math.round(box.top) === Math.round(first?.top ?? 0))
            .length,
          tallest: Math.max(...boxes.map((box) => box.height)),
          shortest: Math.min(...boxes.map((box) => box.height)),
          section: section.getBoundingClientRect().height,
          size: number === null ? null : Number.parseFloat(getComputedStyle(number).fontSize),
        }
      }, label)

    it('is a grid of two columns of short tiles on a phone, never five tall cards', async () => {
      for (const lang of LANGS) {
        const tab = await open(lang, 390, { flat: true })
        const counts = await read(tab, HOME[lang].counts.label)
        expect(counts?.count, lang).toBe(5)
        expect(counts?.columns, `${lang}: two columns`).toBe(2)
        // 64 px tiles, 72 where a noun takes two lines; the whole strip under 250 px.
        expect(counts?.shortest, lang).toBeGreaterThanOrEqual(60)
        expect(counts?.tallest, lang).toBeLessThanOrEqual(100)
        expect(counts?.section, `${lang}: the strip`).toBeLessThanOrEqual(250)
        expect(counts?.size, lang).toBe(26)
        await done(tab)
      }
    })

    it('is three tiles over two on a tablet and five in a row on a desktop', async () => {
      for (const lang of LANGS) {
        const tablet = await open(lang, 768, { flat: true })
        expect((await read(tablet, HOME[lang].counts.label))?.firstRow, `${lang} at 768`).toBe(3)
        await done(tablet)
        const desktop = await open(lang, 1440, { flat: true })
        const counts = await read(desktop, HOME[lang].counts.label)
        expect(counts?.firstRow, `${lang} at 1440`).toBe(5)
        expect(counts?.size, `${lang} at 1440`).toBe(40)
        await done(desktop)
      }
    })

    it.skipIf(engine !== 'chromium')(
      'counts each number up to the registry’s, and no further',
      async () => {
        const tab = await open('ar', 390)
        const section = tab.locator(`section[aria-label="${HOME.ar.counts.label}"]`)
        await section.scrollIntoViewIfNeeded()
        await tab.waitForTimeout(2200)
        const numbers = await section.evaluate((node) =>
          [...node.querySelectorAll('b[data-count]')].map((b) => [
            b.getAttribute('data-count'),
            b.textContent,
          ]),
        )
        expect(numbers.length).toBe(5)
        for (const [target, shown] of numbers) expect(shown).toBe(target)
        await done(tab)
      },
    )
  })

  describe('the product shot', () => {
    const read = (tab: Page, label: string) =>
      tab.evaluate((name) => {
        const figure = document.querySelector(`figure[aria-label="${name}"]`)
        if (figure === null) return null
        const visible = (selector: string) =>
          [...figure.querySelectorAll(selector)].filter((node) => node.checkVisibility()).length
        const root = figure.parentElement
        return {
          height: figure.getBoundingClientRect().height,
          score: [...figure.querySelectorAll('b')].find((b) => /^\d+$/.test(b.textContent.trim()))
            ?.textContent,
          pills: visible('.sev'),
          categories: visible('ul[aria-label] > li'),
          evidence: visible('svg[viewBox="0 0 200 150"]'),
          floats: [...(root?.querySelectorAll('.float') ?? [])].filter((node) =>
            node.checkVisibility(),
          ).length,
        }
      }, label)

    it('is the score, the three severities and three findings on a phone, about 450 px', async () => {
      for (const lang of LANGS) {
        const tab = await open(lang, 390, { flat: true })
        const shot = await read(tab, HOME[lang].figure.label)
        expect(shot?.score, lang).toBe('91')
        // Three severity pills in the summary and one in each of the three findings.
        expect(shot?.pills, `${lang}: pills`).toBe(6)
        expect(shot?.categories, `${lang}: no category bars`).toBe(0)
        expect(shot?.evidence, `${lang}: no overflow drawing`).toBe(0)
        expect(shot?.floats, `${lang}: no floating cards`).toBe(0)
        expect(shot?.height, `${lang}: a short shot`).toBeLessThanOrEqual(520)
        await done(tab)
      }
    })

    it('keeps the richer shot on a desktop: the bars, the drawing and the floating cards', async () => {
      const tab = await open('ar', 1440, { flat: true })
      const shot = await read(tab, HOME.ar.figure.label)
      expect(shot?.categories).toBe(4)
      expect(shot?.evidence).toBe(1)
      expect(shot?.floats).toBe(3)
      await done(tab)
    })
  })

  describe('the sections', () => {
    it('sets every section heading on the scale: 22 px on a phone, 28 from lg, semibold, solid ink', async () => {
      for (const lang of LANGS) {
        for (const [width, size] of [
          [390, 22],
          [1440, 28],
        ] as const) {
          const tab = await open(lang, width, { flat: true })
          const headings = await tab.evaluate(() =>
            [...document.querySelectorAll('main h2')].map((node) => {
              const style = getComputedStyle(node)
              const before = node.previousElementSibling
              return {
                text: node.textContent.trim().slice(0, 24),
                size: Number.parseFloat(style.fontSize),
                weight: Number(style.fontWeight),
                gradient: [node, ...node.querySelectorAll('*')].some(
                  (child) => getComputedStyle(child).webkitTextFillColor === 'rgba(0, 0, 0, 0)',
                ),
                // What stands before it: nothing, or a kicker's words; never an icon.
                icon: before?.querySelector('svg') !== null && before !== null,
              }
            }),
          )
          // The bento, how it works, the monitoring band, the plans, the questions, the closing call.
          expect(headings.length, `${lang} at ${width}`).toBe(6)
          for (const heading of headings) {
            expect(heading.size, `${lang} at ${width}: ${heading.text}`).toBe(size)
            expect(heading.weight, `${lang}: ${heading.text}`).toBe(600)
            expect(heading.gradient, `${lang}: ${heading.text}`).toBe(false)
            expect(heading.icon, `${lang}: an icon before ${heading.text}`).toBe(false)
          }
          await done(tab)
        }
      }
    })

    it('has no card inside a card', async () => {
      for (const width of [390, 1440]) {
        const tab = await open('ar', width, { flat: true })
        const nested = await tab.evaluate(() => document.querySelectorAll('.card .card').length)
        expect(nested, `at ${width}`).toBe(0)
        await done(tab)
      }
    })

    it('draws the bento as a card and six rows on a phone, each one link to its tool', async () => {
      for (const lang of LANGS) {
        const tab = await open(lang, 390, { flat: true })
        const bento = await tab.evaluate(() => {
          const tiles = [
            ...document.querySelectorAll('section[aria-labelledby="bento-title"] article'),
          ]
          return tiles.map((tile) => {
            const links = [...tile.querySelectorAll('a')]
            const marks = [...tile.querySelectorAll('span')].filter(
              (span) => span.checkVisibility() && /مثال|^Example$/.test(span.textContent.trim()),
            )
            return {
              height: tile.getBoundingClientRect().height,
              links: links.length,
              href: links[0]?.getAttribute('href') ?? '',
              // What a tile draws apart from its heading: an illustration made of example data.
              shown: [...tile.querySelectorAll('pre, dl, samp, svg[viewBox="0 0 120 70"]')].filter(
                (n) => n.checkVisibility(),
              ).length,
              marks: marks.length,
            }
          })
        })
        expect(bento.length, lang).toBe(7)
        const [featured, ...rows] = bento
        expect(
          featured?.height,
          `${lang}: the first tile keeps its three browsers`,
        ).toBeGreaterThan(280)
        for (const row of rows) {
          expect(row.height, `${lang}: a row`).toBeLessThanOrEqual(100)
          expect(row.shown, `${lang}: no illustration`).toBe(0)
          expect(row.marks, `${lang}: no «مثال» without an illustration`).toBe(0)
        }
        for (const tile of bento) {
          expect(tile.links, lang).toBe(1)
          expect(tile.href, lang).toContain('/tools/')
        }
        await done(tab)
      }
    })

    it('draws the bento in full on a desktop, with its illustrations marked as examples', async () => {
      const tab = await open('ar', 1440, { flat: true })
      const bento = await tab.evaluate(() => {
        const tiles = [
          ...document.querySelectorAll('section[aria-labelledby="bento-title"] article'),
        ]
        return tiles.map((tile) => ({
          marks: [...tile.querySelectorAll('span')].filter(
            (span) => span.checkVisibility() && span.textContent.trim() === 'مثال',
          ).length,
          pre: [...tile.querySelectorAll('pre')].filter((n) => n.checkVisibility()).length,
        }))
      })
      // Six of the seven are drawn from examples, and say so; the robots.txt tile shows its file.
      expect(bento.map((tile) => tile.marks)).toEqual([0, 1, 1, 1, 1, 1, 1])
      expect(bento.reduce((sum, tile) => sum + tile.pre, 0)).toBe(1)
      await done(tab)
    })

    it('keeps what its illustrations draw inside their boxes, in both languages', async () => {
      for (const lang of LANGS) {
        for (const width of [1280, 1440]) {
          const tab = await open(lang, width, { flat: true, reduced: true })
          const out = await tab.evaluate(() => {
            const poking: string[] = []
            // The fields of the forms tile, the rows of the lists and the engines' rows: a
            // pill that is longer than its field's room (the English «Arabic digits rejected»
            // was) shows past the edge.
            for (const node of document.querySelectorAll(
              'section[aria-labelledby="bento-title"] article span.border-field, section[aria-labelledby="bento-title"] article li, section[aria-labelledby="bento-title"] article > div > div > div',
            )) {
              if (!node.checkVisibility()) continue
              if (node.scrollWidth > node.clientWidth + 1) {
                poking.push(
                  `${node.tagName.toLowerCase()} ${node.scrollWidth} > ${node.clientWidth}`,
                )
              }
            }
            return poking
          })
          expect(out, `${lang} at ${width}`).toEqual([])
          await done(tab)
        }
      }
    })

    it('keeps its controls to a thumb on a phone', async () => {
      for (const lang of LANGS) {
        const tab = await open(lang, 390, { flat: true })
        const small = await tab.evaluate(() => {
          const out: string[] = []
          for (const node of document.querySelectorAll(
            'main a, main button, main summary, main input',
          )) {
            if (!node.checkVisibility()) continue
            // The chips of a row that scrolls are the page's smallest control: 40 px.
            const box = node.getBoundingClientRect()
            const after = getComputedStyle(node, '::after')
            const reach = after.position === 'absolute' ? Number.parseFloat(after.height) : 0
            if (Math.max(box.height, Number.isNaN(reach) ? 0 : reach) < 40) {
              out.push(
                `${node.tagName.toLowerCase()} ${Math.round(box.height)} px "${node.textContent.trim().slice(0, 24)}"`,
              )
            }
          }
          return out
        })
        expect(small, lang).toEqual([])
        await done(tab)
      }
    })

    it.skipIf(engine === 'webkit')(
      'shows a question’s focus ring around its card, which does not clip it',
      async () => {
        const tab = await open('ar', 390, { flat: true })
        // Tab to the first question: whatever comes before it on the page is not this test's.
        for (let step = 0; step < 120; step++) {
          await tab.keyboard.press('Tab')
          const onQuestion = await tab.evaluate(
            () =>
              document.activeElement?.closest('section[aria-labelledby="faq-title"] summary') !==
              null,
          )
          if (onQuestion) break
        }
        const ring = await tab.evaluate(() => {
          const card = document.activeElement?.closest('details')
          if (card === null || card === undefined) return null
          const style = getComputedStyle(card)
          return {
            outline: style.outlineStyle,
            width: style.outlineWidth,
            overflow: style.overflow,
          }
        })
        expect(ring).toEqual({ outline: 'solid', width: '2px', overflow: 'visible' })
        await done(tab)
      },
    )

    it('opens the questions from a 56 px row, with the answers in the page', async () => {
      const tab = await open('ar', 390, { flat: true })
      const faq = await tab.evaluate(() =>
        [...document.querySelectorAll('section[aria-labelledby="faq-title"] details')].map(
          (node) => ({
            row: node.querySelector('summary')?.getBoundingClientRect().height,
            answer: (node.querySelector('p')?.textContent ?? '').trim().length,
          }),
        ),
      )
      expect(faq.length).toBe(4)
      for (const item of faq) {
        expect(item.row).toBeGreaterThanOrEqual(56)
        expect(item.answer).toBeGreaterThan(40)
      }
      await done(tab)
    })
  })

  describe('the page', () => {
    it('is under 7,000 px tall on a phone, in both languages', async () => {
      for (const lang of LANGS) {
        for (const width of [390, 320]) {
          const tab = await open(lang, width, { flat: true })
          const height = await tab.evaluate(() => document.documentElement.scrollHeight)
          expect(height, `${lang} at ${width}`).toBeLessThan(width === 390 ? 7000 : 7600)
          await done(tab)
        }
      }
    })

    it.skipIf(engine !== 'chromium')(
      'has no sideways scroll at 320 to 1440 px, in both languages, with or without motion',
      async () => {
        for (const lang of LANGS) {
          for (const reduced of [false, true]) {
            for (const width of [320, 360, 390, 768, 1024, 1440]) {
              const tab = await open(lang, width, { reduced, flat: true })
              const widths = await tab.evaluate(() => [
                document.documentElement.scrollWidth,
                document.documentElement.clientWidth,
              ])
              expect(widths[0], `${lang}${reduced ? ' reduced' : ''} at ${width}`).toBe(widths[1])
              await done(tab)
            }
          }
        }
      },
      180_000,
    )

    it('runs no animation under reduced motion', async () => {
      for (const lang of LANGS) {
        const tab = await open(lang, 1440, { reduced: true })
        await tab.waitForTimeout(400)
        const running = await tab.evaluate(() =>
          document
            .getAnimations()
            .filter((a) => a instanceof CSSAnimation && a.playState === 'running')
            .map((a) => (a as CSSAnimation).animationName),
        )
        expect(running, lang).toEqual([])
        await done(tab)
      }
    })

    it('has no style attribute and no inline event handler', async () => {
      for (const lang of LANGS) {
        const tab = await open(lang, 390)
        const inline = await tab.evaluate(
          () =>
            [...document.querySelectorAll('*')].filter(
              (node) =>
                node.hasAttribute('style') ||
                node.getAttributeNames().some((name) => name.startsWith('on')),
            ).length,
        )
        expect(inline, lang).toBe(0)
        await done(tab)
      }
    })
  })
})

// The contrast of every line of text on the page, from its pixels, as contrast.browser.test.ts
// measures the first screen: the page is drawn with its text invisible, in a viewport as tall as
// the page, and each line's colour is compared with the worst pixel under it (4.5:1, or 3:1 for
// large text). It is the check the dark band and the closing band need: axe sends a text on a
// gradient to review, and reads a glow as a solid colour (the band's glows are gradients since R7).
describe('the contrast of the whole home page, from its pixels', () => {
  let browser: Browser
  let decoder: Page
  beforeAll(async () => {
    const executablePath = executablePathFor('chromium')
    browser = await chromium.launch(executablePath === undefined ? {} : { executablePath })
    decoder = await (await browser.newContext()).newPage()
    await decoder.setContent('<canvas id="c"></canvas>')
  })
  afterAll(async () => {
    await browser.close()
  })

  interface Line {
    readonly text: string
    readonly x: number
    readonly y: number
    readonly w: number
    readonly h: number
    readonly color: string
    readonly size: number
    readonly weight: number
  }

  async function measure(lang: Lang, width: number) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const context = await browser.newContext({
        viewport: { width, height: width < 600 ? 7600 : 6200 },
        reducedMotion: 'reduce',
        bypassCSP: true,
      })
      await context.route('**/*', async (route) => {
        if (new URL(route.request().url()).origin === site.origin) await route.fallback()
        else await route.abort('blockedbyclient')
      })
      const tab = await context.newPage()
      await tab.goto(site.url(`${prefixOf(lang)}/`))
      await tab.addStyleTag({ content: '*{content-visibility:visible!important}' })
      await tab.evaluate(() => document.fonts.ready)
      await tab.waitForTimeout(500)
      const lines: Line[] = await tab.evaluate(() => {
        const found: Line[] = []
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          const text = (node.nodeValue ?? '').replace(/\s+/g, ' ').trim()
          const element = node.parentElement
          if (text === '' || element === null) continue
          if (element.closest('script,style,noscript,[aria-hidden="true"],.sr-only,[hidden]'))
            continue
          const style = getComputedStyle(element)
          if (style.visibility === 'hidden' || style.display === 'none') continue
          if (Number(style.opacity) === 0 || !element.checkVisibility()) continue
          // Gradient text: its stops are held above 4.5:1 by test/tokens.test.ts.
          if (style.webkitTextFillColor === 'rgba(0, 0, 0, 0)') continue
          const range = document.createRange()
          range.selectNodeContents(node)
          for (const box of range.getClientRects()) {
            let left = box.left
            let top = box.top
            let right = box.right
            let bottom = box.bottom
            // Only what is drawn: a row that scrolls (the marquee under reduced motion) clips its text.
            for (
              let clip: Element | null = element;
              clip !== null && clip !== document.documentElement;
              clip = clip.parentElement
            ) {
              const kind = getComputedStyle(clip)
              if (kind.overflowX === 'visible' && kind.overflowY === 'visible') continue
              const edge = clip.getBoundingClientRect()
              left = Math.max(left, edge.left)
              top = Math.max(top, edge.top)
              right = Math.min(right, edge.right)
              bottom = Math.min(bottom, edge.bottom)
            }
            if (right - left <= 1 || bottom - top <= 1) continue
            found.push({
              text: text.slice(0, 40),
              x: left,
              y: top + window.scrollY,
              w: right - left,
              h: bottom - top,
              color: style.color,
              size: Number.parseFloat(style.fontSize),
              weight: Number(style.fontWeight),
            })
          }
        }
        return found
      })
      await tab.addStyleTag({
        content:
          '*,*::before,*::after{color:transparent!important;-webkit-text-fill-color:transparent!important;text-decoration-color:transparent!important;caret-color:transparent!important;text-shadow:none!important}::placeholder{color:transparent!important}',
      })
      await tab.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      )
      await tab.waitForTimeout(200)
      const picture = await tab.screenshot({ fullPage: true })
      await context.close()
      const rows = await decoder.evaluate(
        async ({ base64, boxes }) => {
          const image = new Image()
          image.src = `data:image/png;base64,${base64}`
          await image.decode()
          const canvas = document.getElementById('c') as HTMLCanvasElement
          canvas.width = image.width
          canvas.height = image.height
          const draw = canvas.getContext('2d', { willReadFrequently: true })
          if (draw === null) throw new Error('no canvas')
          draw.drawImage(image, 0, 0)
          const channel = (value: number) => {
            const c = value / 255
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
          }
          const luminance = (r: number, g: number, b: number) =>
            0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
          const out: { text: string; ratio: number; need: number }[] = []
          for (const box of boxes) {
            const color = /rgba?\((\d+), (\d+), (\d+)/.exec(box.color)
            if (color === null) continue
            const text = luminance(Number(color[1]), Number(color[2]), Number(color[3]))
            const x0 = Math.max(0, Math.floor(box.x))
            const y0 = Math.max(0, Math.floor(box.y))
            const x1 = Math.min(image.width - 1, Math.ceil(box.x + box.w))
            const y1 = Math.min(image.height - 1, Math.ceil(box.y + box.h))
            if (x1 <= x0 || y1 <= y0) continue
            const data = draw.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1).data
            let worst = 99
            for (let i = 0; i < data.length; i += 12) {
              const ground = luminance(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0)
              const ratio = (Math.max(text, ground) + 0.05) / (Math.min(text, ground) + 0.05)
              if (ratio < worst) worst = ratio
            }
            const large = box.size >= 24 || (box.size >= 18.66 && box.weight >= 600)
            out.push({ text: box.text, ratio: worst, need: large ? 3 : 4.5 })
          }
          return out
        },
        { base64: picture.toString('base64'), boxes: lines },
      )
      const unsettled =
        rows.length > 0 && rows.filter((row) => row.ratio < 1.05).length >= 0.9 * rows.length
      if (!unsettled) return rows
    }
    return []
  }

  it.each(LANGS)(
    'has the contrast its size needs, at 390 and 1440 px (%s)',
    async (lang) => {
      for (const width of [390, 1440]) {
        const rows = await measure(lang, width)
        // The whole page has well over a hundred lines of text.
        expect(rows.length, `${lang} at ${width} has text`).toBeGreaterThan(100)
        const under = rows
          .filter((row) => row.ratio < row.need)
          .map((row) => `${row.ratio.toFixed(2)}:1 "${row.text}"`)
        expect(under, `${lang} at ${width}`).toEqual([])
      }
    },
    180_000,
  )
})

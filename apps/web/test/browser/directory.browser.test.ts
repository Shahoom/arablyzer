import { fileURLToPath } from 'node:url'
import { executablePathFor } from '@arablyzer/browser/engines'
import { serveSite, type FixtureSite } from '@arablyzer/fixtures'
import { TOOLS_UI } from '@arablyzer/i18n'
import type { Engine } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'
import { TOOLS } from '@arablyzer/tools'
import { chromium, firefox, webkit, type Browser, type Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The tools' directory (M2.6 R3, rebuilt in R7) as a visitor uses it, in the browsers: every tool in
// the page as the server sends it, as compact rows of a list, then the search and the category
// buttons narrowing the list, by mouse and by keyboard, and an address that names a category opening
// with it chosen. The categories are a row of chips that scrolls sideways on a phone and a vertical
// list in a sticky aside from lg. The site's own pages on loopback, and every request off the site
// refused (eslint.config.js). `pnpm test:browser` builds the site first.
const DIST = fileURLToPath(new URL('../../dist/', import.meta.url))
const TYPES = { chromium, firefox, webkit } as const
const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1440, height: 900 }

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

const TOTAL = TOOLS.length
const inCategory = (category: string) => TOOLS.filter((tool) => tool.category === category).length

/** The directory in a language, every request off the site refused. */
async function open(
  browser: Browser,
  lang: Lang,
  {
    hash = '',
    script = true,
    viewport = DESKTOP,
  }: { hash?: string; script?: boolean; viewport?: { width: number; height: number } } = {},
): Promise<Page> {
  const context = await browser.newContext({ javaScriptEnabled: script, viewport })
  await context.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin === site.origin) await route.fallback()
    else await route.abort('blockedbyclient')
  })
  const tab = await context.newPage()
  await tab.goto(site.url(`${lang === 'ar' ? '' : '/en'}/tools${hash}`))
  return tab
}

/** A category's button as the screen draws it: the other of the two is hidden. */
const button = (tab: Page, filter: string) => tab.locator(`button[data-filter="${filter}"]:visible`)

/** What the directory shows now: the cards, the sections, the chip pressed, and what it says. */
async function shown(tab: Page) {
  return tab.evaluate(() => ({
    cards: [...document.querySelectorAll<HTMLElement>('[data-tool]')]
      .filter((card) => !card.hidden)
      .map((card) => card.querySelector('a')?.getAttribute('href') ?? ''),
    sections: [...document.querySelectorAll<HTMLElement>('section[data-category]')]
      .filter((section) => !section.hidden)
      .map((section) => section.dataset.category ?? ''),
    // The categories are drawn twice, each for its screen: only the one drawn is pressed by a visitor.
    pressed: [...document.querySelectorAll<HTMLButtonElement>('button[data-filter]')]
      .filter((chip) => chip.checkVisibility() && chip.getAttribute('aria-pressed') === 'true')
      .map((chip) => chip.dataset.filter ?? ''),
    count: document.querySelector('#tools-count')?.textContent ?? '',
    none: document.querySelector<HTMLElement>('#tools-none')?.hidden === false,
  }))
}

describe.each(ENGINES)('the tools’ directory in %s', (engine) => {
  let browser: Browser
  beforeAll(async () => {
    const executablePath = executablePathFor(engine)
    browser = await TYPES[engine].launch(executablePath === undefined ? {} : { executablePath })
  })
  afterAll(async () => {
    await browser.close()
  })

  it.each(['ar', 'en'] as const)(
    'lists every tool in the HTML as sent, with no script, in %s',
    async (lang) => {
      const tab = await open(browser, lang, { script: false })
      const state = await shown(tab)
      expect(state.cards).toHaveLength(TOTAL)
      expect(new Set(state.cards).size).toBe(TOTAL)
      for (const tool of TOOLS) {
        expect(state.cards, tool.slug).toContain(`${lang === 'ar' ? '' : '/en'}/tools/${tool.slug}`)
      }
      // The chips are there, "all" pressed: the page is what it says.
      expect(state.pressed).toEqual(['all'])
      expect(state.none).toBe(false)
      await tab.context().close()
    },
    60_000,
  )

  it.each(['ar', 'en'] as const)(
    'narrows to a category with its chip, lets go with the same chip, in %s',
    async (lang) => {
      const t = TOOLS_UI[lang].directory
      const tab = await open(browser, lang)
      // The script has run by the time the page has loaded: it is a module, which is deferred.
      await button(tab, 'rtl').click()
      const narrowed = await shown(tab)
      expect(narrowed.sections).toEqual(['rtl'])
      expect(narrowed.cards).toHaveLength(inCategory('rtl'))
      expect(narrowed.pressed).toEqual(['rtl'])
      expect(narrowed.count).toBe(t.shown(inCategory('rtl'), TOTAL))
      // The address keeps the category, as a tool page's breadcrumb names it.
      expect(new URL(tab.url()).hash).toBe('#cat-rtl')
      await button(tab, 'rtl').click()
      const all = await shown(tab)
      expect(all.cards).toHaveLength(TOTAL)
      expect(all.pressed).toEqual(['all'])
      expect(all.count).toBe(t.count(TOTAL))
      expect(new URL(tab.url()).hash).toBe('')
      await tab.context().close()
    },
    60_000,
  )

  it('works from the keyboard: Enter and Space press a chip', async () => {
    const tab = await open(browser, 'ar')
    await button(tab, 'forms').focus()
    await tab.keyboard.press('Enter')
    expect((await shown(tab)).pressed).toEqual(['forms'])
    expect((await shown(tab)).sections).toEqual(['forms'])
    await tab.keyboard.press('Space')
    expect((await shown(tab)).pressed).toEqual(['all'])
    await button(tab, 'ai').focus()
    await tab.keyboard.press('Space')
    expect((await shown(tab)).sections).toEqual(['ai'])
    await tab.context().close()
  }, 60_000)

  it('finds a tool by a word as people type Arabic, with «ال» or without it', async () => {
    const tab = await open(browser, 'ar')
    // «الاتجاه» is in no card as written: the card of the RTL checker has «واتجاه».
    await tab.fill('#tools-search', 'الاتجاه')
    const found = await shown(tab)
    expect(found.cards).toContain('/tools/rtl-check')
    expect(found.cards.length).toBeLessThan(TOTAL)
    expect(found.sections.length).toBeGreaterThan(0)
    expect(found.count).toBe(TOOLS_UI.ar.directory.shown(found.cards.length, TOTAL))
    // A slug is found in either language's page.
    await tab.fill('#tools-search', 'whatsapp-link-generator')
    expect((await shown(tab)).cards).toEqual(['/tools/whatsapp-link-generator'])
    await tab.fill('#tools-search', '')
    expect((await shown(tab)).cards).toHaveLength(TOTAL)
    await tab.context().close()
  }, 60_000)

  it('says no tool matches when the search and the chip leave none', async () => {
    const tab = await open(browser, 'en')
    await button(tab, 'rtl').click()
    await tab.fill('#tools-search', 'whatsapp')
    const none = await shown(tab)
    expect(none.cards).toEqual([])
    expect(none.sections).toEqual([])
    expect(none.none).toBe(true)
    expect(none.count).toBe(TOOLS_UI.en.directory.shown(0, TOTAL))
    await tab.context().close()
  }, 60_000)

  it('opens with the category an address names, and follows the address when it changes', async () => {
    const tab = await open(browser, 'ar', { hash: '#cat-ai' })
    await tab.locator('button[data-filter="ai"][aria-pressed="true"]:visible').waitFor()
    expect((await shown(tab)).sections).toEqual(['ai'])
    await tab.evaluate(() => {
      window.location.hash = '#cat-speed'
    })
    await tab.locator('button[data-filter="speed"][aria-pressed="true"]:visible').waitFor()
    expect((await shown(tab)).sections).toEqual(['speed'])
    await tab.evaluate(() => {
      window.location.hash = ''
    })
    await tab.locator('button[data-filter="all"][aria-pressed="true"]:visible').waitFor()
    expect((await shown(tab)).cards).toHaveLength(TOTAL)
    await tab.context().close()
  }, 60_000)

  it.each(['ar', 'en'] as const)(
    'draws each tool as a compact row: a dot, its name at 16 px, its question at 14 px, in %s',
    async (lang) => {
      const tab = await open(browser, lang, { viewport: PHONE })
      const rows = await tab.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[data-tool]')].map((row) => {
          const link = row.querySelector('a')
          const [title, summary] = link?.querySelectorAll(':scope > span:last-child > span') ?? []
          const dot = link?.querySelector(':scope > span[aria-hidden="true"]')
          const box = row.getBoundingClientRect()
          return {
            title:
              title === undefined
                ? null
                : [getComputedStyle(title).fontSize, getComputedStyle(title).fontWeight],
            summary: summary === undefined ? null : getComputedStyle(summary).fontSize,
            dot:
              dot === null || dot === undefined
                ? null
                : [dot.getBoundingClientRect().width, getComputedStyle(dot).borderRadius],
            // Nothing but text and its dot: no icon tile, no chevron, no tag.
            svg: row.querySelectorAll('svg').length,
            height: box.height,
            target: link?.getBoundingClientRect().height ?? 0,
          }
        }),
      )
      expect(rows).toHaveLength(TOTAL)
      for (const row of rows) {
        expect(row.title).toEqual(['16px', '600'])
        expect(row.summary).toBe('14px')
        expect(row.dot?.[0]).toBe(8)
        expect(row.svg).toBe(0)
        // A row is a target of 44 px or more.
        expect(row.target).toBeGreaterThanOrEqual(44)
      }
      // The groups' headings are the scale's h2s (22 px on a phone), with no tile before them.
      const headings = await tab.evaluate(() =>
        [...document.querySelectorAll('section[data-category] > div > h2')].map((h2) => {
          const style = getComputedStyle(h2)
          return [style.fontSize, h2.previousElementSibling === null]
        }),
      )
      expect(headings.length).toBeGreaterThan(10)
      for (const heading of headings) expect(heading).toEqual(['22px', true])
      await tab.context().close()
    },
    60_000,
  )

  it('makes the categories one row of chips that scrolls sideways on a phone, with nothing else in the row', async () => {
    const tab = await open(browser, 'ar', { viewport: PHONE })
    const row = await tab.evaluate(() => {
      const node = document.querySelector<HTMLElement>('.scroll-row')
      if (node === null) return null
      const style = getComputedStyle(node)
      return {
        visible: node.checkVisibility(),
        scrolls: node.scrollWidth > node.clientWidth,
        overflowX: style.overflowX,
        fade: style.maskImage !== 'none' || style.getPropertyValue('-webkit-mask-image') !== 'none',
        // Every child is a chip (the label of the Arabic layer and the separators are not in it),
        // pressed or not, and all of them are on one line.
        children: [...node.children].map((child) => [
          child.tagName,
          child.classList.contains('chip'),
        ]),
        tops: new Set(
          [...node.children].map((child) => Math.round(child.getBoundingClientRect().top)),
        ).size,
        // The list of a wide screen is not drawn.
        list: [...document.querySelectorAll<HTMLElement>('button[data-filter]')].filter(
          (chip) => !node.contains(chip) && chip.checkVisibility(),
        ).length,
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
    expect(row?.visible).toBe(true)
    expect(row?.scrolls).toBe(true)
    expect(row?.overflowX).toBe('auto')
    expect(row?.fade).toBe(true)
    // «All», then each category that has a tool.
    expect(row?.children.length).toBe(1 + new Set(TOOLS.map((tool) => tool.category)).size)
    for (const child of row?.children ?? []) expect(child).toEqual(['BUTTON', true])
    expect(row?.tops).toBe(1)
    expect(row?.list).toBe(0)
    expect(row?.page).toBeLessThanOrEqual(0)
    await tab.context().close()
  }, 60_000)

  it.each(['ar', 'en'] as const)(
    'makes the categories a vertical list with counts in a sticky aside from lg, the Arabic layer named, in %s',
    async (lang) => {
      const tab = await open(browser, lang, { viewport: DESKTOP })
      const found = await tab.evaluate(() => {
        const aside = document.querySelector('.page-aside')
        const main = document.querySelector('.page-main')
        if (aside === null || main === null) return null
        const a = aside.getBoundingClientRect()
        const m = main.getBoundingClientRect()
        const list = aside.querySelector<HTMLElement>('div.hidden')
        const buttons = [...(list?.querySelectorAll('button[data-filter]') ?? [])]
        return {
          rtl: getComputedStyle(document.documentElement).direction === 'rtl',
          position: getComputedStyle(aside).position,
          aside: { left: a.left, right: a.right, width: a.width },
          main: { left: m.left, right: m.right, width: m.width },
          row: aside.querySelector('.scroll-row')?.checkVisibility() ?? null,
          listShown: list?.checkVisibility() ?? null,
          // One button to a line, the count at the end of it, 36 px high.
          lines: new Set(buttons.map((button) => Math.round(button.getBoundingClientRect().top)))
            .size,
          count: buttons.length,
          heights: [...new Set(buttons.map((button) => button.getBoundingClientRect().height))],
          counts: buttons.slice(1).map((button) => button.lastElementChild?.textContent ?? ''),
          label: [...aside.querySelectorAll('p')].map((p) => p.textContent.trim()),
          heading: aside.querySelector('h2')?.checkVisibility() ?? null,
        }
      })
      expect(found).not.toBeNull()
      if (found === null) return
      expect(found.position).toBe('sticky')
      expect(found.aside.width).toBeGreaterThanOrEqual(319.5)
      expect(found.aside.width).toBeLessThanOrEqual(368.5)
      expect(found.main.width).toBeLessThanOrEqual(760.5)
      if (found.rtl) expect(found.main.right).toBeGreaterThan(found.aside.right)
      else expect(found.main.left).toBeLessThan(found.aside.left)
      expect(found.row).toBe(false)
      expect(found.listShown).toBe(true)
      expect(found.lines).toBe(found.count)
      expect(found.heights).toEqual([36])
      // Each category's count is the number of tools in it, and they add up to all.
      expect(found.counts.map(Number).reduce((sum, n) => sum + n, 0)).toBe(TOTAL)
      expect(found.label).toContain(TOOLS_UI[lang].directory.arabicLayer)
      expect(found.heading).toBe(true)
      await tab.context().close()
    },
    60_000,
  )

  it('presses a category in the list and in the row together, and lets go of both', async () => {
    const tab = await open(browser, 'en', { viewport: DESKTOP })
    await button(tab, 'speed').click()
    const both = await tab.evaluate(() =>
      [...document.querySelectorAll('button[data-filter="speed"]')].map((chip) =>
        chip.getAttribute('aria-pressed'),
      ),
    )
    expect(both).toEqual(['true', 'true'])
    await button(tab, 'speed').click()
    const none = await tab.evaluate(() =>
      [...document.querySelectorAll('button[data-filter="speed"]')].map((chip) =>
        chip.getAttribute('aria-pressed'),
      ),
    )
    expect(none).toEqual(['false', 'false'])
    await tab.context().close()
  }, 60_000)

  it('keeps a hairline between the rows that are shown, none under the last, as the search narrows', async () => {
    const tab = await open(browser, 'en', { viewport: DESKTOP })
    // «hreflang» matches two rows of the languages' category.
    await tab.fill('#tools-search', 'hreflang')
    const lines = await tab.evaluate(() =>
      [...document.querySelectorAll('[data-tool]')]
        .filter((row) => !(row as HTMLElement).hidden)
        .map((row) => getComputedStyle(row).borderTopWidth),
    )
    expect(lines.length).toBeGreaterThan(1)
    expect(lines[0]).toBe('0px')
    for (const line of lines.slice(1)) expect(line).toBe('1px')
    await tab.context().close()
  }, 60_000)
})

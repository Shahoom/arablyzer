import { fileURLToPath } from 'node:url'
import { executablePathFor } from '@arablyzer/browser/engines'
import { serveSite, type FixtureSite } from '@arablyzer/fixtures'
import { TOOLS_UI } from '@arablyzer/i18n'
import type { Engine } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'
import { TOOLS } from '@arablyzer/tools'
import { chromium, firefox, webkit, type Browser, type Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The tools' directory (M2.6 R3) as a visitor uses it, in the browsers: every tool in the page as
// the server sends it, then the search and the category chips narrowing the list, by mouse and by
// keyboard, and an address that names a category opening with it chosen. The site's own pages on
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

const TOTAL = TOOLS.length
const inCategory = (category: string) => TOOLS.filter((tool) => tool.category === category).length

/** The directory in a language, every request off the site refused. */
async function open(
  browser: Browser,
  lang: Lang,
  { hash = '', script = true }: { hash?: string; script?: boolean } = {},
): Promise<Page> {
  const context = await browser.newContext({ javaScriptEnabled: script })
  await context.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin === site.origin) await route.fallback()
    else await route.abort('blockedbyclient')
  })
  const tab = await context.newPage()
  await tab.goto(site.url(`${lang === 'ar' ? '' : '/en'}/tools${hash}`))
  return tab
}

/** What the directory shows now: the cards, the sections, the chip pressed, and what it says. */
async function shown(tab: Page) {
  return tab.evaluate(() => ({
    cards: [...document.querySelectorAll<HTMLElement>('[data-tool]')]
      .filter((card) => !card.hidden)
      .map((card) => card.querySelector('a')?.getAttribute('href') ?? ''),
    sections: [...document.querySelectorAll<HTMLElement>('section[data-category]')]
      .filter((section) => !section.hidden)
      .map((section) => section.dataset.category ?? ''),
    pressed: [...document.querySelectorAll<HTMLButtonElement>('button[data-filter]')]
      .filter((chip) => chip.getAttribute('aria-pressed') === 'true')
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
      await tab.click('button[data-filter="rtl"]')
      const narrowed = await shown(tab)
      expect(narrowed.sections).toEqual(['rtl'])
      expect(narrowed.cards).toHaveLength(inCategory('rtl'))
      expect(narrowed.pressed).toEqual(['rtl'])
      expect(narrowed.count).toBe(t.shown(inCategory('rtl'), TOTAL))
      // The address keeps the category, as a tool page's breadcrumb names it.
      expect(new URL(tab.url()).hash).toBe('#cat-rtl')
      await tab.click('button[data-filter="rtl"]')
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
    await tab.focus('button[data-filter="forms"]')
    await tab.keyboard.press('Enter')
    expect((await shown(tab)).pressed).toEqual(['forms'])
    expect((await shown(tab)).sections).toEqual(['forms'])
    await tab.keyboard.press('Space')
    expect((await shown(tab)).pressed).toEqual(['all'])
    await tab.focus('button[data-filter="ai"]')
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
    await tab.click('button[data-filter="rtl"]')
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
    await tab.locator('button[data-filter="ai"][aria-pressed="true"]').waitFor()
    expect((await shown(tab)).sections).toEqual(['ai'])
    await tab.evaluate(() => {
      window.location.hash = '#cat-speed'
    })
    await tab.locator('button[data-filter="speed"][aria-pressed="true"]').waitFor()
    expect((await shown(tab)).sections).toEqual(['speed'])
    await tab.evaluate(() => {
      window.location.hash = ''
    })
    await tab.locator('button[data-filter="all"][aria-pressed="true"]').waitFor()
    expect((await shown(tab)).cards).toHaveLength(TOTAL)
    await tab.context().close()
  }, 60_000)
})

import { fileURLToPath } from 'node:url'
import { executablePathFor } from '@arablyzer/browser/engines'
import { serveSite, type FixtureSite } from '@arablyzer/fixtures'
import { KNOWLEDGE_UI } from '@arablyzer/i18n/knowledge'
import { RULES_UI } from '@arablyzer/i18n/rules'
import type { Engine } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'
import { chromium, firefox, webkit, type Browser, type Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { knowledgeIndex } from '../../src/lib/knowledge'
import { GROUP_LIMIT } from '../../src/lib/knowledge-search'

// The knowledge hub (M2.6 R5, rebuilt in R7) as a visitor uses it, in the browsers: every page a
// link before the search runs and after, the search narrowing them as people type Arabic, the
// type filter (a list in the aside from lg, chips above the results below it) and its counts, the
// compact rows with their «show all», a search shared by its address; and the content pages the
// hub leads to (the rule, the fix guides, the glossary, the bot's page, the methodology, the
// directories and the 404 page) on their two columns and their scale, and none of them scrolling
// sideways on a phone as narrow as 320 px. The site's own pages on loopback, and every request off
// the site refused (eslint.config.js). `pnpm test:browser` builds the site first.
const DIST = fileURLToPath(new URL('../../dist/', import.meta.url))
const TYPES = { chromium, firefox, webkit } as const
const HUB: Readonly<Record<Lang, string>> = { ar: '/knowledge', en: '/en/knowledge' }

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

/** A page's own errors: what its script threw, and what the console reported as an error. */
const problems = new WeakMap<Page, string[]>()

/**
 * A page of the site, every request off the site refused. With `script: false` the island never
 * runs: the page as a crawler that reads no script sees it.
 */
async function open(
  browser: Browser,
  path: string,
  {
    script = true,
    width = 1280,
    height = 900,
  }: { script?: boolean; width?: number; height?: number } = {},
): Promise<Page> {
  const context = await browser.newContext({
    javaScriptEnabled: script,
    viewport: { width, height },
  })
  await context.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin === site.origin) await route.fallback()
    else await route.abort('blockedbyclient')
  })
  const tab = await context.newPage()
  const found: string[] = []
  problems.set(tab, found)
  tab.on('pageerror', (error) => found.push(error.message))
  tab.on('console', (message) => {
    if (message.type() === 'error') found.push(message.text())
  })
  await tab.goto(site.url(path))
  // Astro takes `ssr` off an island once it has hydrated it.
  if (script && /^\/(?:en\/)?knowledge/.test(path)) {
    await tab.locator('astro-island:not([ssr]) #knowledge-search').waitFor()
  }
  return tab
}

const ROWS = 'section[aria-labelledby^="knowledge-"] li a'

/** The hub's chips, by what they say, with the count each shows. */
async function chips(tab: Page, lang: Lang): Promise<Record<string, number>> {
  const buttons = tab
    .getByRole('group', { name: KNOWLEDGE_UI[lang].typesLabel })
    .getByRole('button')
  const found: Record<string, number> = {}
  for (const text of await buttons.allTextContents()) {
    const match = /^(.*?)\s*(\d+)$/.exec(text.trim())
    found[match?.[1]?.trim() ?? text] = Number(match?.[2])
  }
  return found
}

describe.each(ENGINES)('the knowledge hub in %s', (engine) => {
  let browser: Browser
  beforeAll(async () => {
    const executablePath = executablePathFor(engine)
    browser = await TYPES[engine].launch(executablePath === undefined ? {} : { executablePath })
  })
  afterAll(async () => {
    await browser.close()
  })

  it.each(['ar', 'en'] as const)(
    'links every page before its script runs, and still after (%s)',
    async (lang) => {
      const expected = knowledgeIndex(lang).items.map((item) => item.href)
      for (const script of [false, true]) {
        const tab = await open(browser, HUB[lang], { script })
        const hrefs = await tab
          .locator(ROWS)
          .evaluateAll((links) => links.map((link) => link.getAttribute('href')))
        expect(hrefs, `script ${String(script)}`).toEqual(expected)
        // The tiles lead to the four directories, whatever runs.
        expect(await tab.locator('#browse-title ~ ul a').count()).toBe(4)
        expect(problems.get(tab)).toEqual([])
        await tab.context().close()
      }
    },
    60_000,
  )

  it('narrows the pages by what is typed, and counts what is left on each chip', async () => {
    const tab = await open(browser, HUB.ar)
    const all = await chips(tab, 'ar')
    expect(all['الكل']).toBe(await tab.locator(ROWS).count())

    await tab.fill('#knowledge-search', 'robots')
    await tab.locator('[role="status"]:not(:empty)').waitFor()
    const found = await tab.locator(ROWS).count()
    expect(found).toBeGreaterThan(0)
    expect(found).toBeLessThan(all['الكل'] ?? 0)
    expect((await chips(tab, 'ar'))['الكل']).toBe(found)
    expect(await tab.locator('[role="status"]').textContent()).toBe(KNOWLEDGE_UI.ar.status(found))
    // The checker named robots.txt comes before whatever only mentions it.
    expect(await tab.locator(ROWS).first().textContent()).toContain('robots.txt')

    // «صفحة» is found by «صفحه», «الاتجاه» by «اتجاه»: as people type.
    await tab.fill('#knowledge-search', 'صفحة')
    const withTaa = await tab.locator(ROWS).count()
    await tab.fill('#knowledge-search', 'صفحه')
    expect(await tab.locator(ROWS).count()).toBe(withTaa)
    expect(withTaa).toBeGreaterThan(0)
    await tab.fill('#knowledge-search', 'الاتجاه')
    const withArticle = await tab.locator(ROWS).count()
    await tab.fill('#knowledge-search', 'اتجاه')
    expect(await tab.locator(ROWS).count()).toBe(withArticle)

    // Nothing found says so, and what to try; clearing brings every page back.
    await tab.fill('#knowledge-search', 'zzzqx')
    await tab.getByText('لا نتائج لـ', { exact: false }).first().waitFor()
    expect(await tab.locator(ROWS).count()).toBe(0)
    expect(await tab.getByText(KNOWLEDGE_UI.ar.none.hint).count()).toBe(1)
    await tab.getByRole('button', { name: KNOWLEDGE_UI.ar.search.clear }).click()
    expect(await tab.locator(ROWS).count()).toBe(all['الكل'])
    expect(await tab.locator('#knowledge-search').inputValue()).toBe('')
    expect(problems.get(tab)).toEqual([])
    await tab.context().close()
  }, 60_000)

  it('shows one kind when its chip is pressed, and says which is pressed', async () => {
    const tab = await open(browser, HUB.en)
    const all = await chips(tab, 'en')
    const rules = tab.getByRole('button', { name: new RegExp(`^${KNOWLEDGE_UI.en.types.rule}`) })
    expect(await rules.getAttribute('aria-pressed')).toBe('false')
    await rules.click()
    expect(await rules.getAttribute('aria-pressed')).toBe('true')
    expect(await tab.locator('section[aria-labelledby^="knowledge-"]').count()).toBe(1)
    expect(await tab.locator(ROWS).count()).toBe(all[KNOWLEDGE_UI.en.types.rule])
    // A rule's row says how serious it is.
    expect(await tab.locator('section[aria-labelledby="knowledge-rule"] li .sev').count()).toBe(
      all[KNOWLEDGE_UI.en.types.rule],
    )
    expect(problems.get(tab)).toEqual([])
    await tab.context().close()
  }, 60_000)

  it('keeps the words typed before its script has loaded', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (url.origin !== site.origin) await route.abort('blockedbyclient')
      else if (/\/KnowledgeSearch\.[\w-]+\.js$/.test(url.pathname)) {
        await held
        await route.fallback()
      } else await route.fallback()
    })
    const tab = await context.newPage()
    const found: string[] = []
    tab.on('pageerror', (error) => found.push(error.message))
    await tab.goto(site.url(HUB.ar), { waitUntil: 'domcontentloaded' })
    const field = tab.locator('#knowledge-search')
    const all = await tab.locator(ROWS).count()
    // The island has not run: its field is the page's own, and takes what is typed.
    expect(await tab.locator('astro-island[ssr]').count()).toBeGreaterThan(0)
    await field.fill('robots')
    expect(await tab.locator(ROWS).count()).toBe(all)
    release()
    await tab.locator('astro-island:not([ssr]) #knowledge-search').waitFor()
    // Once it has, the words are still there, and the pages are narrowed by them.
    await expect.poll(() => tab.locator(ROWS).count()).toBeLessThan(all)
    expect(await field.inputValue()).toBe('robots')
    expect(found).toEqual([])
    await context.close()
  }, 60_000)

  it('is shared by its address: ?q and ?type fill the search, and typing writes them back', async () => {
    const tab = await open(browser, `${HUB.ar}?q=robots&type=rule`)
    await expect.poll(async () => tab.locator('#knowledge-search').inputValue()).toBe('robots')
    const rules = tab.getByRole('button', { name: new RegExp(`^${KNOWLEDGE_UI.ar.types.rule}`) })
    expect(await rules.getAttribute('aria-pressed')).toBe('true')
    const found = await tab.locator(ROWS).count()
    expect(found).toBeGreaterThan(0)
    expect(await tab.locator('section[aria-labelledby^="knowledge-"]').count()).toBe(1)

    await tab.fill('#knowledge-search', 'hreflang')
    await expect.poll(() => new URL(tab.url()).searchParams.get('q')).toBe('hreflang')
    expect(new URL(tab.url()).searchParams.get('type')).toBe('rule')
    await tab.getByRole('button', { name: KNOWLEDGE_UI.ar.search.clear }).click()
    await expect.poll(() => new URL(tab.url()).searchParams.has('q')).toBe(false)
    expect(problems.get(tab)).toEqual([])
    await tab.context().close()
  }, 60_000)

  // A page of Arabic draws the Latin letters of a heading, a lead or a tag in DM Sans. Not
  // preloaded, it arrives after the first paint, and the swap re-wrapped a heading and moved the
  // page under it (a glossary term's page measured 0.08 to 0.10 of layout shift, a guide's 0.16 in
  // the same test). R5 preloaded it on its pages; R6 on every page (heads.browser.test.ts).
  it.each([
    ['/knowledge'],
    ['/rules'],
    ['/rules/rtl-html-dir'],
    ['/fix'],
    ['/fix/soft-404'],
    ['/glossary'],
    ['/glossary/ai-crawlers'],
    ['/bot'],
    ['/methodology'],
  ])(
    'preloads Plex Arabic’s and DM Sans’ two weights for its first screen: %s',
    async (path) => {
      const tab = await open(browser, path)
      expect(await tab.locator('link[rel="preload"][as="font"]').count()).toBe(4)
      await tab.context().close()
    },
    60_000,
  )

  // The same page, with the fonts that are not preloaded held back for a while, as a slow network
  // holds them: nothing may move. Chromium alone reports layout shifts.
  it.runIf(engine === 'chromium').each([['/fix/soft-404'], ['/glossary/ai-crawlers']])(
    'does not move when a font arrives late: %s',
    async (path) => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const preloaded = new Set<string>()
      await context.route('**/*', async (route) => {
        const url = new URL(route.request().url())
        if (url.origin !== site.origin) await route.abort('blockedbyclient')
        else if (url.pathname.endsWith('.woff2') && !preloaded.has(url.pathname)) {
          await new Promise((resolve) => setTimeout(resolve, 600))
          await route.fallback()
        } else await route.fallback()
      })
      const tab = await context.newPage()
      await tab.addInitScript(() => {
        const w = window as unknown as { shift: number }
        w.shift = 0
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean }
            if (!shift.hadRecentInput) w.shift += shift.value
          }
        }).observe({ type: 'layout-shift', buffered: true })
      })
      // The fonts the page preloads are answered at once, as the browser asks for them first.
      const html = await (await tab.request.get(site.url(path))).text()
      for (const match of html.matchAll(/<link rel="preload" href="([^"]+\.woff2)"/g)) {
        preloaded.add(match[1] ?? '')
      }
      await tab.goto(site.url(path), { waitUntil: 'load' })
      await tab.waitForTimeout(1600)
      const shift = await tab.evaluate(() => (window as unknown as { shift: number }).shift)
      expect(shift).toBeLessThan(0.01)
      await context.close()
    },
    60_000,
  )

  describe('the hub’s two columns (M2.6 R7)', () => {
    /** Where the hub's columns, its filter list and its chip row are at a width. */
    async function columns(width: number, lang: Lang) {
      const tab = await open(browser, HUB[lang], { width })
      const found = await tab.evaluate(() => {
        const rtl = getComputedStyle(document.documentElement).direction === 'rtl'
        const main = document.querySelector('.page-main')
        const aside = document.querySelector('.page-aside')
        const row = document.querySelector('.scroll-row')
        if (main === null || aside === null || row === null) return null
        const a = main.getBoundingClientRect()
        const b = aside.getBoundingClientRect()
        const first = document.querySelector('section[aria-labelledby^="knowledge-"]')
        return {
          rtl,
          main: { left: a.left, right: a.right, width: a.width },
          aside: { left: b.left, right: b.right, width: b.width },
          asideShown: aside.checkVisibility(),
          asideSticky: getComputedStyle(aside).position,
          rowShown: row.checkVisibility(),
          rowOverflow: getComputedStyle(row).overflowX,
          rowScrolls: row.scrollWidth > row.clientWidth + 1,
          chips: [...row.querySelectorAll('button')].map((chip) => ({
            height: chip.getBoundingClientRect().height,
            pressed: chip.getAttribute('aria-pressed'),
          })),
          list: [...aside.querySelectorAll('button')].map((button) => ({
            height: button.getBoundingClientRect().height,
            pressed: button.getAttribute('aria-pressed'),
            text: button.textContent.trim(),
          })),
          rowBottom: row.getBoundingClientRect().bottom,
          firstGroupTop: first?.getBoundingClientRect().top ?? 0,
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
        }
      })
      await tab.context().close()
      return found
    }

    it.each(['ar', 'en'] as const)(
      'lists the types in the aside from lg, which sticks, beside a main column of 760 px at the most (%s)',
      async (lang) => {
        for (const width of [1024, 1440]) {
          const found = await columns(width, lang)
          const where = `${lang} at ${String(width)}`
          expect(found, where).not.toBeNull()
          if (found === null) continue
          expect(found.asideShown, `${where}: the aside is drawn`).toBe(true)
          expect(found.rowShown, `${where}: no chip row`).toBe(false)
          expect(found.asideSticky, `${where}: the aside sticks`).toBe('sticky')
          expect(found.main.width, `${where}: main`).toBeLessThanOrEqual(760.5)
          expect(found.main.width, `${where}: main is wide enough to read`).toBeGreaterThan(560)
          expect(found.aside.width, `${where}: aside`).toBeGreaterThanOrEqual(319.5)
          expect(found.aside.width, `${where}: aside`).toBeLessThanOrEqual(368.5)
          // The main column is where the line starts, the aside where it ends.
          if (found.rtl) expect(found.main.left, where).toBeGreaterThan(found.aside.right)
          else expect(found.main.right, where).toBeLessThan(found.aside.left)
          // Five kinds with their counts, one pressed, each a row a pointer can hit.
          expect(found.list, where).toHaveLength(5)
          expect(
            found.list.filter((row) => row.pressed === 'true'),
            where,
          ).toHaveLength(1)
          for (const row of found.list) {
            expect(row.height, `${where}: ${row.text}`).toBeGreaterThanOrEqual(38)
            expect(row.text, where).toMatch(/\d+$/)
          }
          expect(found.scrollW, `${where}: no sideways scroll`).toBe(found.clientW)
        }
      },
      90_000,
    )

    it.each(['ar', 'en'] as const)(
      'lists the types as a row of chips above the results below lg (%s)',
      async (lang) => {
        for (const width of [320, 390, 768, 1023]) {
          const found = await columns(width, lang)
          const where = `${lang} at ${String(width)}`
          expect(found, where).not.toBeNull()
          if (found === null) continue
          expect(found.asideShown, `${where}: no aside`).toBe(false)
          expect(found.rowShown, `${where}: the chip row is drawn`).toBe(true)
          expect(found.chips, where).toHaveLength(5)
          expect(
            found.chips.filter((chip) => chip.pressed === 'true'),
            where,
          ).toHaveLength(1)
          // 40 px for a thumb on a phone, 36 from md.
          for (const chip of found.chips) {
            expect(chip.height, where).toBeGreaterThanOrEqual(width < 768 ? 40 : 36)
          }
          // Above the results, not after them.
          expect(found.rowBottom, `${where}: above the first group`).toBeLessThanOrEqual(
            found.firstGroupTop,
          )
          // On a phone the row scrolls sideways, and the page does not.
          if (width <= 390) {
            expect(found.rowOverflow, `${where}: scrolls`).toBe('auto')
            expect(found.rowScrolls, `${where}: more chips than the screen holds`).toBe(true)
          }
          expect(found.scrollW, `${where}: no sideways scroll`).toBe(found.clientW)
        }
      },
      90_000,
    )

    it('presses the same kind from the chips below lg and from the list from lg', async () => {
      for (const width of [390, 1440]) {
        const tab = await open(browser, HUB.ar, { width })
        const group = tab.getByRole('group', { name: KNOWLEDGE_UI.ar.typesLabel })
        expect(await group.count(), `at ${String(width)}: one group is exposed`).toBe(1)
        await group
          .getByRole('button', { name: new RegExp(`^${KNOWLEDGE_UI.ar.types.term}`) })
          .click()
        expect(await tab.locator('section[aria-labelledby^="knowledge-"]').count()).toBe(1)
        expect(await tab.locator('#knowledge-term').count()).toBe(1)
        expect(await tab.locator(ROWS).count()).toBe(knowledgeIndex('ar').totals.term)
        await tab.context().close()
      }
    }, 60_000)
  })

  describe('the hub’s rows (M2.6 R7)', () => {
    const GROUPS = ['knowledge-tool', 'knowledge-rule', 'knowledge-fix', 'knowledge-term']

    /** What each group shows: its rows in the HTML, those drawn, and its disclosure. */
    const groupsOf = (tab: Page) =>
      tab.evaluate(() =>
        [...document.querySelectorAll('section[aria-labelledby^="knowledge-"]')].map((section) => {
          const rows = [...section.querySelectorAll('li a')]
          const details = section.querySelector('details')
          return {
            id: section.getAttribute('aria-labelledby'),
            rows: rows.length,
            drawn: rows.filter((row) => row.checkVisibility()).length,
            details: section.querySelectorAll('details').length,
            open: details?.hasAttribute('open') ?? null,
            summary: details?.querySelector('summary')?.textContent.trim() ?? null,
          }
        }),
      )

    it('shows the first rows of each group and the rest behind «show all», with and without script', async () => {
      const totals = knowledgeIndex('ar').totals
      for (const script of [false, true]) {
        const tab = await open(browser, HUB.ar, { script })
        const groups = await groupsOf(tab)
        expect(
          groups.map((group) => group.id),
          `script ${String(script)}`,
        ).toEqual(GROUPS)
        for (const group of groups) {
          const where = `${String(group.id)} (script ${String(script)})`
          // Every page is a link in the HTML; a few are drawn; the control is a shut disclosure.
          expect(group.drawn, where).toBe(GROUP_LIMIT)
          expect(group.details, where).toBe(1)
          expect(group.open, where).toBe(false)
          expect(group.summary, where).toContain(KNOWLEDGE_UI.ar.showAll)
        }
        expect(groups.map((group) => group.rows)).toEqual([
          totals.tool,
          totals.rule,
          totals.fix,
          totals.term,
        ])
        await tab.context().close()
      }
    }, 60_000)

    it('opens the rest of a group in place, and shuts it again', async () => {
      for (const script of [false, true]) {
        const tab = await open(browser, HUB.en, { script })
        const total = knowledgeIndex('en').totals.fix
        const summary = tab.locator('section[aria-labelledby="knowledge-fix"] summary')
        await summary.click()
        let fix = (await groupsOf(tab)).find((group) => group.id === 'knowledge-fix')
        expect(fix?.open, `script ${String(script)}`).toBe(true)
        expect(fix?.drawn, `script ${String(script)}: every guide is drawn`).toBe(total)
        // The other groups are as they were, and the control says what it does now.
        expect((await groupsOf(tab)).filter((group) => group.drawn === GROUP_LIMIT)).toHaveLength(3)
        expect(fix?.summary).toContain(KNOWLEDGE_UI.en.showFewer)
        // From the keyboard too: a native disclosure takes Enter.
        await summary.focus()
        await tab.keyboard.press('Enter')
        fix = (await groupsOf(tab)).find((group) => group.id === 'knowledge-fix')
        expect(fix?.open, `script ${String(script)}: shut again`).toBe(false)
        expect(fix?.drawn).toBe(GROUP_LIMIT)
        await tab.context().close()
      }
    }, 60_000)

    it('shows all of a kind when it is chosen, and a few matches whole', async () => {
      const tab = await open(browser, HUB.ar)
      const rules = knowledgeIndex('ar').totals.rule
      await tab.getByRole('button', { name: new RegExp(`^${KNOWLEDGE_UI.ar.types.rule}`) }).click()
      let groups = await groupsOf(tab)
      expect(groups).toHaveLength(1)
      expect(groups[0]?.details, 'no disclosure when one kind is chosen').toBe(0)
      expect(groups[0]?.drawn, 'every rule is drawn').toBe(rules)
      await tab.getByRole('button', { name: new RegExp(`^${KNOWLEDGE_UI.ar.types.all}`) }).click()
      // A search with few matches is a short list: nothing is hidden behind a control.
      await tab.fill('#knowledge-search', 'robots')
      await tab.locator('[role="status"]:not(:empty)').waitFor()
      groups = await groupsOf(tab)
      expect(groups.length).toBeGreaterThan(1)
      for (const group of groups) {
        expect(group.details, String(group.id)).toBe(0)
        expect(group.drawn, String(group.id)).toBe(group.rows)
      }
      // A search with many matches keeps to the limit in a group that is long.
      await tab.fill('#knowledge-search', 'صفحة')
      await expect.poll(async () => (await groupsOf(tab)).length).toBeGreaterThan(1)
      for (const group of await groupsOf(tab)) {
        const long = group.rows > GROUP_LIMIT + 2
        expect(group.drawn, String(group.id)).toBe(long ? GROUP_LIMIT : group.rows)
        expect(group.details, String(group.id)).toBe(long ? 1 : 0)
      }
      await tab.context().close()
    }, 60_000)

    it.each(['ar', 'en'] as const)(
      'draws compact rows on a phone, and a page a fraction of the height it was (%s)',
      async (lang) => {
        const tab = await open(browser, HUB[lang], { width: 390, height: 844 })
        const found = await tab.evaluate(() => {
          const rows = [...document.querySelectorAll('section[aria-labelledby^="knowledge-"] li a')]
          return {
            rows: rows
              .filter((row) => row.checkVisibility())
              .map((row) => {
                const title = row.querySelector('[data-part="title"]')
                const summary = row.querySelector('[data-part="summary"]')
                const dot = row.querySelector('.kb-dot')
                const box = row.getBoundingClientRect()
                const dotBox = dot?.getBoundingClientRect()
                return {
                  height: box.height,
                  title:
                    title === null
                      ? null
                      : [getComputedStyle(title).fontSize, getComputedStyle(title).fontWeight],
                  summary: summary === null ? null : getComputedStyle(summary).fontSize,
                  dot: dotBox === undefined ? null : [dotBox.width, dotBox.height],
                  // One line of summary on a phone: the clamp.
                  summaryLines:
                    summary === null
                      ? 0
                      : Math.round(
                          summary.getBoundingClientRect().height /
                            Number.parseFloat(getComputedStyle(summary).lineHeight),
                        ),
                }
              }),
            height: document.documentElement.scrollHeight,
            scrollW: document.documentElement.scrollWidth,
            clientW: document.documentElement.clientWidth,
          }
        })
        expect(found.rows).toHaveLength(GROUP_LIMIT * 4)
        for (const row of found.rows) {
          expect(row.title, lang).toEqual(['16px', '600'])
          expect(row.summary, lang).toBe('14px')
          expect(row.dot, lang).toEqual([8, 8])
          expect(row.summaryLines, lang).toBeLessThanOrEqual(1)
          // Two lines of text and the padding round them: a row, not a card.
          expect(row.height, lang).toBeGreaterThanOrEqual(56)
          expect(row.height, lang).toBeLessThanOrEqual(130)
        }
        // The hub was 24,147 px tall on a phone with every row drawn.
        expect(found.height, lang).toBeLessThan(5000)
        expect(found.scrollW).toBe(found.clientW)
        await tab.context().close()
      },
      60_000,
    )

    it('has no icon square and no gradient, and its tiles are solid ink', async () => {
      for (const width of [390, 1440]) {
        const tab = await open(browser, HUB.ar, { width })
        const found = await tab.evaluate(() => {
          const gradient = (node: Element) =>
            [node, ...node.querySelectorAll('*')].some(
              (child) => getComputedStyle(child).webkitTextFillColor === 'rgba(0, 0, 0, 0)',
            )
          const tiles = [...document.querySelectorAll('#browse-title ~ ul a')]
          const numbers = tiles.map((tile) => tile.querySelector('span'))
          return {
            tiles: tiles.length,
            icons: tiles.filter((tile) => tile.querySelector('svg') !== null).length,
            gradient: tiles.filter(gradient).length,
            gradientHeadings: [...document.querySelectorAll('main h1, main h2')].filter(gradient)
              .length,
            sizes: numbers.map((node) => (node === null ? '' : getComputedStyle(node).fontSize)),
            // A heading of a group has no icon or box before it (the count is inside it).
            groupIcons: [
              ...document.querySelectorAll('section[aria-labelledby^="knowledge-"] h2'),
            ].filter(
              (heading) =>
                heading.querySelector('svg') !== null || heading.previousElementSibling !== null,
            ).length,
          }
        })
        const where = `at ${String(width)}`
        expect(found.tiles, where).toBe(4)
        expect(found.icons, `${where}: no icon in a tile`).toBe(0)
        expect(found.gradient, `${where}: no gradient count`).toBe(0)
        expect(found.gradientHeadings, `${where}: no gradient heading`).toBe(0)
        expect(found.groupIcons, `${where}: no square before a group's heading`).toBe(0)
        // heading-2: 22 px on a phone, 28 from lg.
        for (const size of found.sizes) expect(size, where).toBe(width < 1024 ? '22px' : '28px')
        await tab.context().close()
      }
    }, 60_000)
  })

  describe('the documents on two columns (M2.6 R7)', () => {
    // A rule, a fix guide, a glossary term, the bot's page and the methodology: each is a head and
    // sections in a main column of 760 px at the most, and beside it, from lg, a sticky aside with
    // its contents and the pages it points to. Below lg the contents are a disclosure under the
    // head, shut, and the aside comes after the text.
    const DOCS = [
      '/rules/rtl-html-dir',
      '/fix/soft-404',
      '/glossary/robots-txt',
      '/bot',
      '/methodology',
    ]
    const prefixOf = (lang: Lang) => (lang === 'en' ? '/en' : '')

    /** The page's columns, its contents in both forms, and the scale of its text. */
    async function read(path: string, width: number) {
      const tab = await open(browser, path, { width })
      const found = await tab.evaluate(() => {
        const rtl = getComputedStyle(document.documentElement).direction === 'rtl'
        const main = document.querySelector('.page-main')
        const aside = document.querySelector('.page-aside')
        if (main === null || aside === null) return null
        const a = main.getBoundingClientRect()
        const b = aside.getBoundingClientRect()
        const list = document.querySelector('#contents-title')?.closest('nav') ?? null
        const sheet = document.querySelector('main details')
        const block = document.querySelector('main section[id] :is(p, li)')
        const sections = [...document.querySelectorAll('main section[id]')]
        const gradient = [...document.querySelectorAll('main *')].filter(
          (node) => getComputedStyle(node).webkitTextFillColor === 'rgba(0, 0, 0, 0)',
        )
        return {
          rtl,
          main: { left: a.left, right: a.right, width: a.width, top: a.top },
          aside: { left: b.left, right: b.right, width: b.width, top: b.top },
          sticky: getComputedStyle(aside).position,
          listShown: list?.checkVisibility() ?? null,
          listLinks:
            list === null
              ? []
              : [...list.querySelectorAll('a[href^="#"]')].map((link) => link.textContent.trim()),
          sheetShown: sheet?.checkVisibility() ?? null,
          sheetOpen: sheet?.hasAttribute('open') ?? null,
          sheetSummary: sheet?.querySelector('summary')?.getBoundingClientRect().height ?? null,
          sheetLinks:
            sheet === null
              ? []
              : [...sheet.querySelectorAll('nav a')].map((link) => ({
                  href: link.getAttribute('href'),
                  height: link.getBoundingClientRect().height,
                })),
          sectionIds: sections.map((section) => section.id),
          // A heading has nothing before it in its section: no number, no icon.
          headings: sections.map((section) => {
            const heading = section.querySelector(':scope > h2')
            return heading === null
              ? null
              : [getComputedStyle(heading).fontSize, heading.previousElementSibling === null]
          }),
          text:
            block === null
              ? null
              : [getComputedStyle(block).fontSize, getComputedStyle(block).lineHeight],
          gradient: gradient.length,
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
        }
      })
      await tab.context().close()
      return found
    }

    it.each(DOCS)(
      'puts the text in a main column of 760 px at the most beside a sticky aside from lg, with its contents (%s)',
      async (path) => {
        for (const lang of ['ar', 'en'] as const) {
          for (const width of [1024, 1440]) {
            const found = await read(`${prefixOf(lang)}${path}`, width)
            const where = `${lang}${path} at ${String(width)}`
            expect(found, where).not.toBeNull()
            if (found === null) continue
            expect(found.main.width, `${where}: main`).toBeLessThanOrEqual(760.5)
            expect(found.main.width, `${where}: main is wide enough to read`).toBeGreaterThan(560)
            expect(found.aside.width, `${where}: aside`).toBeGreaterThanOrEqual(319.5)
            expect(found.aside.width, `${where}: aside`).toBeLessThanOrEqual(368.5)
            if (found.rtl) expect(found.main.left, where).toBeGreaterThan(found.aside.right)
            else expect(found.main.right, where).toBeLessThan(found.aside.left)
            expect(found.sticky, `${where}: the aside sticks`).toBe('sticky')
            // The contents are the list in the aside, and name every section, with no number.
            expect(found.listShown, `${where}: the contents list`).toBe(true)
            expect(found.sheetShown, `${where}: no disclosure`).toBe(false)
            expect(found.listLinks, where).toHaveLength(found.sectionIds.length)
            for (const link of found.listLinks) expect(link, where).not.toMatch(/^\d/)
            expect(found.scrollW, `${where}: no sideways scroll`).toBe(found.clientW)
          }
        }
      },
      120_000,
    )

    it.each(DOCS)(
      'puts the contents in a shut disclosure under the head, and the aside after the text, below lg (%s)',
      async (path) => {
        for (const lang of ['ar', 'en'] as const) {
          for (const width of [320, 390, 768, 1023]) {
            const found = await read(`${prefixOf(lang)}${path}`, width)
            const where = `${lang}${path} at ${String(width)}`
            expect(found, where).not.toBeNull()
            if (found === null) continue
            expect(found.listShown, `${where}: no list`).toBe(false)
            expect(found.sheetShown, `${where}: the disclosure`).toBe(true)
            expect(found.sheetOpen, `${where}: shut`).toBe(false)
            expect(found.sheetSummary, `${where}: a thumb's height`).toBeGreaterThanOrEqual(44)
            // One column, the aside after the text.
            expect(Math.abs(found.main.left - found.aside.left), where).toBeLessThan(1)
            expect(found.aside.top, `${where}: after the text`).toBeGreaterThan(found.main.top)
            expect(found.sticky, `${where}: not sticky`).toBe('static')
            expect(found.scrollW, `${where}: no sideways scroll`).toBe(found.clientW)
          }
        }
      },
      120_000,
    )

    it.each(DOCS)(
      'sets its text at the body size, and its headings at heading-2 with nothing before them (%s)',
      async (path) => {
        for (const lang of ['ar', 'en'] as const) {
          for (const [width, size] of [
            [390, '22px'],
            [1440, '28px'],
          ] as const) {
            const found = await read(`${prefixOf(lang)}${path}`, width)
            const where = `${lang}${path} at ${String(width)}`
            // 16 px at every width (it was 17 from md), with Arabic's leading and Latin's.
            expect(found?.text, where).toEqual(['16px', lang === 'ar' ? '28px' : '25.6px'])
            for (const heading of found?.headings ?? []) {
              expect(heading, where).toEqual([size, true])
            }
            expect(found?.gradient, `${where}: no gradient text`).toBe(0)
          }
        }
      },
      120_000,
    )

    it('lists the sections of a disclosure as links a thumb can hit, each to a section of the page', async () => {
      const tab = await open(browser, '/rules/rtl-html-dir', { width: 390 })
      await tab.locator('main details > summary').click()
      const found = await tab.evaluate(() => {
        const links = [...document.querySelectorAll('main details nav a')]
        return links.map((link) => ({
          height: link.getBoundingClientRect().height,
          target: document.getElementById(link.getAttribute('href')?.slice(1) ?? '') !== null,
        }))
      })
      expect(found.length).toBeGreaterThanOrEqual(4)
      for (const link of found) {
        expect(link.height).toBeGreaterThanOrEqual(44)
        expect(link.target).toBe(true)
      }
      await tab.context().close()
    }, 60_000)

    it('draws a rule’s weight as a solid number in its aside, and no gradient anywhere on the page', async () => {
      for (const lang of ['ar', 'en'] as const) {
        const tab = await open(browser, `${prefixOf(lang)}/rules/rtl-html-dir`, { width: 1440 })
        const found = await tab.evaluate(() => {
          const heading = document.querySelector('#weight-title')
          const number = heading?.querySelector('span')
          if (heading === null || number === null || number === undefined) return null
          const style = getComputedStyle(number)
          return {
            text: number.textContent.trim(),
            size: Number.parseFloat(style.fontSize),
            fill: style.webkitTextFillColor,
            inAside: heading.closest('.page-aside') !== null,
            gradients: document.querySelectorAll('.gradient-text').length,
          }
        })
        expect(found, lang).not.toBeNull()
        // The weight of a serious rule is 5 (packages/scoring); the number is ink, 28 px, not 56.
        expect(found?.text, lang).toBe('5')
        expect(found?.size, lang).toBeLessThanOrEqual(28)
        expect(found?.fill, lang).not.toBe('rgba(0, 0, 0, 0)')
        expect(found?.inAside, lang).toBe(true)
        expect(found?.gradients, lang).toBe(0)
        await tab.context().close()
      }
    }, 60_000)

    it('keeps a rule’s example, steps and references: the two blocks, numbered steps with no gradient', async () => {
      const tab = await open(browser, '/rules/rtl-html-dir', { width: 390 })
      const found = await tab.evaluate(() => {
        const step = document.querySelector('.rule-detect > ol > li')
        const style = step === null ? null : getComputedStyle(step, '::before')
        return {
          blocks: document.querySelectorAll('#example figure').length,
          steps: document.querySelectorAll('.rule-detect > ol > li').length,
          stepImage: style?.backgroundImage ?? null,
          stepSize: style === null ? null : [style.width, style.height],
          references: document.querySelectorAll('#references a').length,
        }
      })
      expect(found.blocks).toBe(2)
      expect(found.steps).toBeGreaterThanOrEqual(3)
      expect(found.stepImage, 'a step’s number is not a gradient').toBe('none')
      expect(found.stepSize).toEqual(['32px', '32px'])
      expect(found.references).toBeGreaterThan(0)
      await tab.context().close()
    }, 60_000)
  })

  describe('the directories (M2.6 R7)', () => {
    const DIRECTORIES = [
      { path: '/rules', kind: 'rule', headings: true },
      { path: '/fix', kind: 'fix', headings: true },
      { path: '/glossary', kind: 'term', headings: false },
    ] as const
    const prefixOf = (lang: Lang) => (lang === 'en' ? '/en' : '')

    async function read(path: string, width: number) {
      const tab = await open(browser, path, { width })
      const found = await tab.evaluate(() => {
        const aside = document.querySelector('.page-aside')
        const nav = document.querySelector('#knowledge-nav-title')?.closest('nav') ?? null
        const categories = document.querySelector('#categories-title')?.closest('nav') ?? null
        const chips = document.querySelector('main .scroll-row')
        const rows = [...document.querySelectorAll('main .kb-row')]
        const headings = [...document.querySelectorAll('main .kb-list')].map((list) => {
          const heading = list.parentElement?.querySelector('h2') ?? null
          return heading === null
            ? null
            : [
                getComputedStyle(heading).fontSize,
                heading.querySelector('svg') === null,
                heading.previousElementSibling === null,
              ]
        })
        return {
          rows: rows.length,
          rowHeights: rows
            .filter((row) => row.checkVisibility())
            .map((row) => row.getBoundingClientRect().height),
          cards: document.querySelectorAll('main .kb-list .card').length,
          headings,
          aside:
            aside === null
              ? null
              : {
                  shown: aside.checkVisibility(),
                  sticky: getComputedStyle(aside).position,
                  width: aside.getBoundingClientRect().width,
                },
          nav:
            nav === null
              ? null
              : {
                  shown: nav.checkVisibility(),
                  current: [...nav.querySelectorAll('a[aria-current="page"]')].map((link) =>
                    link.getAttribute('href'),
                  ),
                  links: [...nav.querySelectorAll('a')].map((link) => link.getAttribute('href')),
                },
          categories:
            categories === null
              ? null
              : {
                  shown: categories.checkVisibility(),
                  hrefs: [...categories.querySelectorAll('a')].map((link) =>
                    link.getAttribute('href'),
                  ),
                },
          chips:
            chips === null
              ? null
              : {
                  shown: chips.checkVisibility(),
                  hrefs: [...chips.querySelectorAll('a')].map((link) => link.getAttribute('href')),
                  height: chips.querySelector('a')?.getBoundingClientRect().height ?? 0,
                },
          sectionIds: [...document.querySelectorAll('main section[id]')].map(
            (section) => section.id,
          ),
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
        }
      })
      await tab.context().close()
      return found
    }

    it.each(DIRECTORIES)(
      'lists every page as a compact row in one card, with the aside from lg ($path)',
      async ({ path, kind, headings }) => {
        const totals = knowledgeIndex('ar').totals
        for (const lang of ['ar', 'en'] as const) {
          for (const width of [390, 1440]) {
            const found = await read(`${prefixOf(lang)}${path}`, width)
            const where = `${lang}${path} at ${String(width)}`
            // Every page is a row, in lists that are cards of rows, with no card inside a card.
            expect(found.rows, where).toBe(totals[kind])
            expect(found.cards, `${where}: no card inside a card`).toBe(0)
            for (const height of found.rowHeights) {
              expect(height, where).toBeGreaterThanOrEqual(48)
              expect(height, where).toBeLessThanOrEqual(190)
            }
            // A group's heading is heading-2 with nothing before it.
            if (headings) {
              for (const heading of found.headings) {
                expect(heading, where).toEqual([width < 1024 ? '22px' : '28px', true, true])
              }
            }
            // The other sections of the knowledge pages are a list in the aside (the page's own
            // is marked), and on a phone it follows the list.
            expect(found.nav?.shown, `${where}: the sections list`).toBe(true)
            expect(found.nav?.current, where).toEqual([`${prefixOf(lang)}${path}`])
            expect(found.nav?.links, where).toHaveLength(4)
            if (width >= 1024) {
              expect(found.aside?.shown, where).toBe(true)
              expect(found.aside?.sticky, `${where}: the aside sticks`).toBe('sticky')
              expect(found.aside?.width, where).toBeGreaterThanOrEqual(319.5)
              expect(found.aside?.width, where).toBeLessThanOrEqual(368.5)
            }
            expect(found.scrollW, `${where}: no sideways scroll`).toBe(found.clientW)
          }
        }
      },
      120_000,
    )

    it('lists the rules’ categories in the aside from lg, and as chips that jump to them below it', async () => {
      for (const lang of ['ar', 'en'] as const) {
        const wide = await read(`${prefixOf(lang)}/rules`, 1440)
        const phone = await read(`${prefixOf(lang)}/rules`, 390)
        expect(wide.categories?.shown, `${lang}: the list`).toBe(true)
        expect(wide.chips?.shown, `${lang}: no chips from lg`).toBe(false)
        expect(phone.categories?.shown, `${lang}: no list on a phone`).toBe(false)
        expect(phone.chips?.shown, `${lang}: the chips`).toBe(true)
        expect(phone.chips?.height, `${lang}: a thumb's height`).toBeGreaterThanOrEqual(40)
        // The same categories, each pointing at a section of the page.
        expect(wide.categories?.hrefs.length, lang).toBeGreaterThan(5)
        expect(phone.chips?.hrefs, lang).toEqual(wide.categories?.hrefs)
        for (const href of wide.categories?.hrefs ?? []) {
          expect(wide.sectionIds, `${lang} ${String(href)}`).toContain(String(href).slice(1))
        }
      }
    }, 60_000)

    it('narrows the rules by a word typed, and leaves no stray line between the rows left', async () => {
      const tab = await open(browser, '/rules')
      await tab.fill('#rules-search', 'rtl-html-dir')
      await expect
        .poll(() => tab.locator('#rules-count').textContent())
        .toBe(RULES_UI.ar.library.count(1))
      const found = await tab.evaluate(() => {
        const shown = [...document.querySelectorAll<HTMLElement>('main .kb-row')].filter((row) =>
          row.checkVisibility(),
        )
        const list = shown[0]?.closest('.kb-list')
        return {
          shown: shown.length,
          sections: [...document.querySelectorAll<HTMLElement>('section[data-category]')].filter(
            (section) => !section.hidden,
          ).length,
          // The only row left is the first of its list: no hairline above it.
          topLine:
            shown[0]?.parentElement === null || shown[0] === undefined
              ? null
              : getComputedStyle(shown[0].parentElement).borderTopWidth,
          lists: list === null || list === undefined ? 0 : 1,
        }
      })
      expect(found.shown).toBe(1)
      expect(found.sections).toBe(1)
      expect(found.topLine).toBe('0px')
      await tab.fill('#rules-search', 'zzzqx')
      await expect.poll(() => tab.locator('#rules-none').isVisible()).toBe(true)
      await tab.fill('#rules-search', '')
      expect(
        await tab
          .locator('main .kb-row')
          .evaluateAll((rows) => rows.filter((row) => row.checkVisibility()).length),
      ).toBe(knowledgeIndex('ar').totals.rule)
      await tab.context().close()
    }, 60_000)
  })

  describe('the 404 page (M2.6 R7)', () => {
    it.each(['/404', '/en/404'])(
      'is calm: a modest number in one colour, a heading, a search and four ways on (%s)',
      async (path) => {
        for (const width of [390, 1440]) {
          const tab = await open(browser, path, { width, height: width < 600 ? 844 : 900 })
          const found = await tab.evaluate(() => {
            const number = document.querySelector('main p[dir="ltr"]')
            const heading = document.querySelector('main h1')
            const form = document.querySelector('main form[role="search"]')
            const links = [...document.querySelectorAll('main ul a')]
            const gradient = [...document.querySelectorAll('main *')].filter(
              (node) => getComputedStyle(node).webkitTextFillColor === 'rgba(0, 0, 0, 0)',
            )
            return {
              number:
                number === null
                  ? null
                  : [
                      number.textContent.trim(),
                      Number.parseFloat(getComputedStyle(number).fontSize),
                      getComputedStyle(number).fontWeight,
                    ],
              heading:
                heading === null ? null : Number.parseFloat(getComputedStyle(heading).fontSize),
              align: heading === null ? null : getComputedStyle(heading).textAlign,
              form:
                form === null
                  ? null
                  : [
                      form.getAttribute('action'),
                      form.querySelector('input')?.getAttribute('name') ?? null,
                    ],
              links: links.map((link) => [
                link.getAttribute('href'),
                link.getBoundingClientRect().height,
              ]),
              button: form?.querySelector('button')?.getBoundingClientRect().height ?? 0,
              gradient: gradient.length,
              scan: document.querySelectorAll('.scan-ring, .aurora').length,
              height: document.documentElement.scrollHeight,
              scrollW: document.documentElement.scrollWidth,
              clientW: document.documentElement.clientWidth,
            }
          })
          const where = `${path} at ${String(width)}`
          // «404» is a number, not a heading: 48 px on a phone, 56 from lg, semibold, no gradient.
          expect(found.number, where).toEqual(['404', width < 1024 ? 48 : 56, '600'])
          expect(found.gradient, `${where}: no gradient`).toBe(0)
          expect(found.scan, `${where}: no ring and no aurora`).toBe(0)
          expect(found.heading, where).toBe(width < 1024 ? 28 : 40)
          expect(found.align, where).toBe('center')
          // The hub reads ?q=, so the visitor's words go on there.
          expect(found.form?.[0], where).toBe(`${path.startsWith('/en') ? '/en' : ''}/knowledge`)
          expect(found.form?.[1], where).toBe('q')
          expect(
            found.links.map((link) => link[0]),
            where,
          ).toEqual(
            ['/', '/tools', '/rules', '/#scan'].map((href) =>
              `${path.startsWith('/en') ? '/en' : ''}${href}`.replace(/^\/en\/$/, '/en/'),
            ),
          )
          for (const link of found.links) expect(Number(link[1]), where).toBeGreaterThanOrEqual(44)
          expect(found.button, `${where}: the primary button`).toBe(48)
          // A phone sees all of it without a long scroll: it was 1,463 px with its footer.
          if (width < 600) expect(found.height, where).toBeLessThan(1300)
          expect(found.scrollW, `${where}: no sideways scroll`).toBe(found.clientW)
          await tab.context().close()
        }
      },
      60_000,
    )
  })

  // The redesign gave each of these pages a new body. The bot's page had overflowed by 8 px at
  // 360 px, for a code chip that could not wrap: no page of the hub, the libraries, the guides,
  // the glossary or the site's own documents may scroll sideways on the narrowest phones. At 320
  // px a list item's column is 260, and a short code that must not break (`code.whole`) was wider:
  // a rule's page with one, and a term's, scrolled by 3 to 5 px (M2.6 R6).
  it.each([
    ['/knowledge'],
    ['/rules'],
    ['/rules/rtl-html-dir'],
    ['/rules/a11y-valid-lang'],
    ['/rules/whatsapp-link-format'],
    ['/fix'],
    ['/fix/soft-404'],
    ['/glossary'],
    ['/glossary/robots-txt'],
    ['/glossary/json-ld'],
    ['/bot'],
    ['/methodology'],
    ['/404'],
  ])(
    'does not scroll sideways at 320, 360 and 390 px: %s, in both languages',
    async (path) => {
      for (const lang of ['ar', 'en'] as const) {
        for (const width of [320, 360, 390]) {
          const tab = await open(browser, `${lang === 'en' ? '/en' : ''}${path}`, { width })
          const [scroll, client] = await tab.evaluate(
            () =>
              [document.documentElement.scrollWidth, document.documentElement.clientWidth] as const,
          )
          expect(scroll, `${lang} ${path} at ${String(width)} px`).toBeLessThanOrEqual(client)
          await tab.context().close()
        }
      }
    },
    120_000,
  )
})

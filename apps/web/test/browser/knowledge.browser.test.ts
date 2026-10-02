import { fileURLToPath } from 'node:url'
import { executablePathFor } from '@arablyzer/browser/engines'
import { serveSite, type FixtureSite } from '@arablyzer/fixtures'
import { KNOWLEDGE_UI } from '@arablyzer/i18n/knowledge'
import type { Engine } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'
import { chromium, firefox, webkit, type Browser, type Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { knowledgeIndex } from '../../src/lib/knowledge'

// The knowledge hub (M2.6 R5) as a visitor uses it, in the browsers: every page a link before
// the search runs and after, the search narrowing them as people type Arabic, the chips and their
// counts, a search shared by its address; and, since the redesign moved the content pages to a
// new layout, that none of them scrolls sideways on a phone as narrow as 360 px. The site's own
// pages on loopback, and every request off the site refused (eslint.config.js). `pnpm
// test:browser` builds the site first.
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
  { script = true, width = 1280 }: { script?: boolean; width?: number } = {},
): Promise<Page> {
  const context = await browser.newContext({
    javaScriptEnabled: script,
    viewport: { width, height: 900 },
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

  // The redesign gave each of these pages a new body. The bot's page had overflowed by 8 px at
  // 360 px, for a code chip that could not wrap: no page of the hub, the libraries, the guides,
  // the glossary or the site's own documents may scroll sideways on the narrowest phones.
  it.each([
    ['/knowledge'],
    ['/rules'],
    ['/rules/rtl-html-dir'],
    ['/fix'],
    ['/fix/soft-404'],
    ['/glossary'],
    ['/glossary/robots-txt'],
    ['/bot'],
    ['/methodology'],
    ['/404'],
  ])(
    'does not scroll sideways at 360 and 390 px: %s, in both languages',
    async (path) => {
      for (const lang of ['ar', 'en'] as const) {
        for (const width of [360, 390]) {
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

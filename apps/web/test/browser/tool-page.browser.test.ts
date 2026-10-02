import { fileURLToPath } from 'node:url'
import { executablePathFor } from '@arablyzer/browser/engines'
import { serveSite, type FixtureSite } from '@arablyzer/fixtures'
import { TOOLS_UI } from '@arablyzer/i18n'
import { GENERATORS_UI } from '@arablyzer/i18n/generators'
import { SCAN_FORM } from '@arablyzer/i18n/scan-form'
import { TOOL_APP } from '@arablyzer/i18n/tool-app'
import type { Engine } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'
import { chromium, firefox, webkit, type Browser, type Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// A tool page (M2.6 R3, rebuilt in R7) as a visitor uses it, in the browsers, apart from what its
// tool does (tool.browser.test.ts and generators.browser.test.ts): the box in the sticky aside of a
// scan tool (and first in the main column for a generator), its small label, the line of what it
// reads, the fine print with its disclosure, the questions and the methodology that fold and open,
// and no page that scrolls sideways on a phone, before and after its tool answers. The site's own
// pages on loopback, and every request off the site refused (eslint.config.js). `pnpm test:browser`
// builds the site first.
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

const prefixOf = (lang: Lang) => (lang === 'ar' ? '' : '/en')

/** A page of the site, every request off the site refused. */
async function open(
  browser: Browser,
  path: string,
  {
    script = true,
    phone = false,
    desktop = false,
  }: { script?: boolean; phone?: boolean; desktop?: boolean } = {},
): Promise<Page> {
  const context = await browser.newContext({
    javaScriptEnabled: script,
    ...(phone ? { viewport: PHONE } : desktop ? { viewport: DESKTOP } : {}),
  })
  await context.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin === site.origin) await route.fallback()
    else await route.abort('blockedbyclient')
  })
  const tab = await context.newPage()
  await tab.goto(site.url(path))
  return tab
}

/** A tool's box, ready: its island has started, which is when the page has its final size. */
async function ready(tab: Page): Promise<void> {
  await tab.locator('astro-island:not([ssr]) .scan-box').first().waitFor()
  await tab.evaluate(() => document.fonts.ready)
}

/** How far the page scrolls sideways: nothing, if it does not. */
const overflowOf = (tab: Page) =>
  tab.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

describe.each(ENGINES)('a tool page in %s', (engine) => {
  let browser: Browser
  beforeAll(async () => {
    const executablePath = executablePathFor(engine)
    browser = await TYPES[engine].launch(executablePath === undefined ? {} : { executablePath })
  })
  afterAll(async () => {
    await browser.close()
  })

  it.each(['ar', 'en'] as const)(
    'has its questions and its methodology open as sent, and folds them when it runs, in %s',
    async (lang) => {
      const path = `${prefixOf(lang)}/tools/rtl-check`
      // As sent: every answer is in the page, and each button says it is open.
      const bare = await open(browser, path, { script: false })
      expect(await bare.locator('#faq h3 button[aria-expanded="true"]').count()).toBeGreaterThan(0)
      expect(await bare.locator('#faq [hidden], #about [hidden]').count()).toBe(0)
      await bare.context().close()
      // Run: each starts folded, and its button opens and folds it.
      const tab = await open(browser, path)
      const first = tab.locator('#faq-q-0')
      const answer = tab.locator('#faq-a-0')
      await first.waitFor()
      expect(await first.getAttribute('aria-expanded')).toBe('false')
      expect(await answer.isHidden()).toBe(true)
      await first.click()
      expect(await first.getAttribute('aria-expanded')).toBe('true')
      expect(await answer.isVisible()).toBe(true)
      // The next question stays as it was.
      expect(await tab.locator('#faq-a-1').isHidden()).toBe(true)
      await first.click()
      expect(await answer.isHidden()).toBe(true)
      // From the keyboard, Enter opens and Space folds.
      await tab.focus('#faq-q-1')
      await tab.keyboard.press('Enter')
      expect(await tab.locator('#faq-a-1').isVisible()).toBe(true)
      await tab.keyboard.press('Space')
      expect(await tab.locator('#faq-a-1').isHidden()).toBe(true)
      // The methodology folds too, and shows its date when it is open.
      const about = tab.locator('#about-toggle')
      expect(await about.getAttribute('aria-expanded')).toBe('false')
      expect(await tab.locator('#about time').isHidden()).toBe(true)
      await about.click()
      expect(await tab.locator('#about time').isVisible()).toBe(true)
      await tab.context().close()
    },
    60_000,
  )

  it('says what a tool reads in one line of meta text, and the browsers a tool that renders opens', async () => {
    const t = TOOL_APP.ar.form
    // The browsers, by name, after the words that say the page is drawn in them.
    const renders = await open(browser, '/tools/js-rendering-check')
    const line = renders.locator('#tool-reads')
    await line.waitFor()
    expect(await line.locator('span[lang="en"]').allTextContents()).toEqual([
      'Chromium',
      'Firefox',
      'WebKit',
    ])
    expect((await line.textContent())?.startsWith(t.rendersIn)).toBe(true)
    await renders.context().close()
    // A tool that reads the HTML as the server sends it opens no browser, and does not say so;
    // its line is plain text, not a chip.
    const reads = await open(browser, '/tools/rtl-check')
    const what = reads.locator('#tool-reads')
    await what.waitFor()
    expect(await what.textContent()).toBe(`${t.reads} HTML`)
    expect(await what.locator('span[lang="en"]').count()).toBe(0)
    const style = await what.evaluate((node) => {
      const css = getComputedStyle(node)
      return [css.fontSize, css.backgroundColor, css.borderTopWidth]
    })
    expect(style).toEqual(['13px', 'rgba(0, 0, 0, 0)', '0px'])
    expect(await reads.locator('.scan-box .chip').count()).toBe(0)
    await reads.context().close()
  }, 60_000)

  it.each(['ar', 'en'] as const)(
    'names the tool in a small label at the top of its box, with no pill and no ×, in %s',
    async (lang) => {
      const title = {
        ar: 'فحص RTL واتجاه الصفحة',
        en: 'RTL checker',
      }[lang]
      for (const path of ['/tools/rtl-check', '/tools/whatsapp-link-generator']) {
        const tab = await open(browser, `${prefixOf(lang)}${path}`)
        await ready(tab)
        const label = tab.locator('.scan-box > p').first()
        const found = await label.evaluate((node) => {
          const css = getComputedStyle(node)
          return {
            text: node.textContent.trim(),
            size: css.fontSize,
            weight: css.fontWeight,
            ground: css.backgroundColor,
          }
        })
        if (path.endsWith('rtl-check')) expect(found.text).toBe(title)
        expect(found.size, path).toBe('13px')
        expect(found.weight, path).toBe('600')
        expect(found.ground, path).toBe('rgba(0, 0, 0, 0)')
        // The × that left for the full check is gone: a box has no link in it.
        expect(await tab.locator('.scan-box a').count(), path).toBe(0)
        await tab.context().close()
      }
    },
    60_000,
  )

  it.each(['ar', 'en'] as const)(
    'has a 48 px field and button in the box of a scan tool, in %s',
    async (lang) => {
      const tab = await open(browser, `${prefixOf(lang)}/tools/rtl-check`, { phone: true })
      await ready(tab)
      const sizes = await tab.evaluate(() => {
        const field = document.querySelector('#tool-url')?.parentElement
        const button = document.querySelector('.scan-box form button[type="submit"]')
        const box = document.querySelector('.scan-box')
        return {
          field: field?.getBoundingClientRect().height,
          button: button?.getBoundingClientRect().height,
          // The button is the box's width less its padding: full width on a phone.
          buttonWidth: button?.getBoundingClientRect().width,
          boxWidth: box?.getBoundingClientRect().width,
          input: getComputedStyle(document.querySelector('#tool-url') ?? document.body).fontSize,
        }
      })
      expect(sizes.field).toBe(48)
      expect(sizes.button).toBe(48)
      expect(sizes.input).toBe('16px')
      // The box's padding is 16 px a side and its border 1 px.
      expect(Math.abs((sizes.boxWidth ?? 0) - 34 - (sizes.buttonWidth ?? 0))).toBeLessThan(1)
      await tab.context().close()
    },
    60_000,
  )

  it.each(['ar', 'en'] as const)(
    'has the fine print as one line and a «What we keep» disclosure, in %s',
    async (lang) => {
      const t = SCAN_FORM[lang]
      const tab = await open(browser, `${prefixOf(lang)}/tools/rtl-check`)
      await ready(tab)
      const note = tab.locator('.scan-box #tool-note')
      expect(await note.locator('p').first().textContent()).toBe(t.note.free)
      const summary = note.locator('details > summary')
      expect(await summary.textContent()).toBe(t.note.keepTitle)
      // Folded, its body is not shown; the sentence of what is kept is in it.
      const body = tab.locator('#tool-note-keep')
      expect(await body.isVisible()).toBe(false)
      expect(await body.textContent()).toBe(t.queryNote)
      // The line and the body are 13 px of quiet ink; the summary is in the brand's ink.
      const looks = await tab.evaluate(() => {
        const css = (selector: string) => {
          const node = document.querySelector(selector)
          if (node === null) return null
          const style = getComputedStyle(node)
          return [style.fontSize, style.color]
        }
        return {
          line: css('#tool-note-line'),
          summary: css('#tool-note summary'),
          body: css('#tool-note-keep'),
        }
      })
      expect(looks.line).toEqual(['13px', 'rgb(71, 84, 103)'])
      expect(looks.summary).toEqual(['13px', 'rgb(0, 95, 104)'])
      expect(looks.body).toEqual(['13px', 'rgb(71, 84, 103)'])
      // A target of at least 24 px.
      expect((await summary.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(24)
      // It opens with a click, and shuts with Enter from the keyboard.
      await summary.click()
      expect(await body.isVisible()).toBe(true)
      await summary.focus()
      await tab.keyboard.press('Enter')
      expect(await body.isVisible()).toBe(false)
      await tab.keyboard.press('Space')
      expect(await body.isVisible()).toBe(true)
      await tab.context().close()
    },
    60_000,
  )

  it('shows the focus ring on the summary when the keyboard reaches it', async () => {
    const tab = await open(browser, '/tools/rtl-check')
    await ready(tab)
    // The button is disabled until the island runs: Tab would pass it by.
    await tab.locator('form button[type="submit"]:not([disabled])').waitFor()
    await tab.locator('#tool-url').focus()
    // Tab on from the field, to the summary: some engines stop on the button on the way, and
    // WebKit on macOS does not stop on buttons.
    let ring: string[] | null = null
    for (let presses = 0; presses < 4 && ring === null; presses++) {
      await tab.keyboard.press('Tab')
      ring = await tab.evaluate(() => {
        const active = document.activeElement
        if (active?.tagName !== 'SUMMARY') return null
        const style = getComputedStyle(active)
        return [style.outlineStyle, style.outlineWidth]
      })
    }
    expect(ring).toEqual(['solid', '2px'])
    await tab.context().close()
  }, 60_000)

  it('says to which host the DNS tool sends the page’s domain, in the disclosure', async () => {
    const tab = await open(browser, '/tools/email-security')
    await ready(tab)
    const body = tab.locator('#tool-note-keep')
    expect(await body.isVisible()).toBe(false)
    expect(await body.locator('p').allTextContents()).toEqual([
      SCAN_FORM.ar.queryNote,
      TOOL_APP.ar.form.sentOut.dns ?? '',
    ])
    await tab.context().close()
  }, 60_000)

  it.each(['ar', 'en'] as const)(
    'puts the box of a scan tool in an aside that sticks 24 px under the header from lg, in %s',
    async (lang) => {
      const tab = await open(browser, `${prefixOf(lang)}/tools/rtl-check`, { desktop: true })
      await ready(tab)
      const where = await tab.evaluate(() => {
        const aside = document.querySelector('.page-aside')
        const main = document.querySelector('.page-main')
        if (aside === null || main === null) return null
        const a = aside.getBoundingClientRect()
        const m = main.getBoundingClientRect()
        return {
          rtl: getComputedStyle(document.documentElement).direction === 'rtl',
          boxInAside: aside.querySelector('.scan-box') !== null,
          boxInMain: main.querySelector('.scan-box') !== null,
          position: getComputedStyle(aside).position,
          aside: { left: a.left, right: a.right, width: a.width },
          main: { left: m.left, right: m.right, width: m.width },
        }
      })
      expect(where).not.toBeNull()
      if (where === null) return
      expect(where.boxInAside).toBe(true)
      expect(where.boxInMain).toBe(false)
      expect(where.position).toBe('sticky')
      // The aside is 320 to 360 px, the main column 760 at the most, and the main column is where
      // the line starts.
      expect(where.aside.width).toBeGreaterThanOrEqual(319.5)
      expect(where.aside.width).toBeLessThanOrEqual(368.5)
      expect(where.main.width).toBeLessThanOrEqual(760.5)
      if (where.rtl) expect(where.main.right).toBeGreaterThan(where.aside.right)
      else expect(where.main.left).toBeLessThan(where.aside.left)
      // It sticks while the text scrolls: the header is 64 px, and the aside's own 4 px of
      // padding is pulled back by its margin.
      await tab.evaluate(() => {
        window.scrollTo(0, 900)
      })
      await tab.waitForTimeout(150)
      const top = await tab.evaluate(
        () => document.querySelector('.page-aside')?.getBoundingClientRect().top ?? null,
      )
      expect(top ?? 0).toBeGreaterThanOrEqual(84 - 1)
      expect(top ?? 0).toBeLessThanOrEqual(88 + 1)
      await tab.context().close()
    },
    60_000,
  )

  it.each(['ar', 'en'] as const)(
    'puts the box right under the lead on a phone, with the sections after it, in %s',
    async (lang) => {
      const tab = await open(browser, `${prefixOf(lang)}/tools/rtl-check`, { phone: true })
      await ready(tab)
      const found = await tab.evaluate(() => {
        const aside = document.querySelector('.page-aside')
        const main = document.querySelector('.page-main')
        const box = document.querySelector('.scan-box')
        const lead = document.querySelector('h1 + p')
        const button = box?.querySelector('button[type="submit"]')
        if (aside === null || main === null || box === null || lead === null || !button) return null
        return {
          position: getComputedStyle(aside).position,
          asideTop: aside.getBoundingClientRect().top,
          mainTop: main.getBoundingClientRect().top,
          leadBottom: lead.getBoundingClientRect().bottom,
          boxTop: box.getBoundingClientRect().top,
          buttonBottom: button.getBoundingClientRect().bottom,
          contents: document.querySelector('.page-aside nav')?.checkVisibility() ?? null,
        }
      })
      expect(found).not.toBeNull()
      if (found === null) return
      // One column: the aside, with the box, comes before the sections and is not sticky.
      expect(found.position).toBe('static')
      expect(found.asideTop).toBeLessThan(found.mainTop)
      // The box is within a section's gap of the lead, and the whole of it is on the first screen.
      expect(found.boxTop - found.leadBottom).toBeLessThan(80)
      expect(found.buttonBottom).toBeLessThan(PHONE.height)
      // The list of the page's sections is for a wide screen.
      expect(found.contents).toBe(false)
      await tab.context().close()
    },
    60_000,
  )

  it.each(['ar', 'en'] as const)(
    'puts a generator’s box first in the main column, with the page’s contents in the aside, in %s',
    async (lang) => {
      const path = `${prefixOf(lang)}/tools/whatsapp-link-generator`
      const wide = await open(browser, path, { desktop: true })
      await ready(wide)
      const found = await wide.evaluate(() => {
        const aside = document.querySelector('.page-aside')
        const main = document.querySelector('.page-main')
        if (aside === null || main === null) return null
        const first = main.firstElementChild
        return {
          boxInMain: main.querySelector('.scan-box') !== null,
          boxInAside: aside.querySelector('.scan-box') !== null,
          // The island is the first of the column; the box is in it.
          first: first?.tagName.toLowerCase(),
          firstHasBox: first?.querySelector('.scan-box') !== null,
          contents: [...aside.querySelectorAll('nav a')].map((link) => link.getAttribute('href')),
          position: getComputedStyle(aside).position,
        }
      })
      expect(found).not.toBeNull()
      expect(found?.boxInMain).toBe(true)
      expect(found?.boxInAside).toBe(false)
      expect(found?.firstHasBox).toBe(true)
      expect(found?.contents).toEqual(['#checks', '#example', '#fix', '#faq', '#links', '#about'])
      expect(found?.position).toBe('sticky')
      await wide.context().close()
      // On a phone the aside is not drawn at all, and the box is the first thing under the lead.
      const narrow = await open(browser, path, { phone: true })
      await ready(narrow)
      const phone = await narrow.evaluate(() => {
        const aside = document.querySelector('.page-aside')
        const box = document.querySelector('.scan-box')
        const lead = document.querySelector('h1 + p')
        if (aside === null || box === null || lead === null) return null
        return {
          aside: getComputedStyle(aside).display,
          gap: box.getBoundingClientRect().top - lead.getBoundingClientRect().bottom,
        }
      })
      expect(phone?.aside).toBe('none')
      expect(phone?.gap ?? 999).toBeLessThan(80)
      await narrow.context().close()
    },
    60_000,
  )

  it.each(['ar', 'en'] as const)(
    'lists the page’s sections in the aside of a wide screen, each link to a section, in %s',
    async (lang) => {
      const t = TOOLS_UI[lang].page
      const tab = await open(browser, `${prefixOf(lang)}/tools/rtl-check`, { desktop: true })
      await ready(tab)
      const nav = tab.locator(`.page-aside nav[aria-label="${t.contents}"]`)
      expect(await nav.isVisible()).toBe(true)
      const hrefs = await nav
        .locator('a')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
      expect(hrefs).toEqual(['#checks', '#example', '#fix', '#faq', '#links', '#about'])
      // Each names a section that is in the page, and the page is in that order.
      const order = await tab.evaluate(
        (ids) => ids.map((id) => document.getElementById(id)?.getBoundingClientRect().top ?? -1),
        ['checks', 'example', 'fix', 'faq', 'links', 'about'],
      )
      expect(order.every((top) => top >= 0)).toBe(true)
      expect([...order].sort((a, b) => a - b)).toEqual(order)
      await tab.context().close()
    },
    60_000,
  )

  it.each(['ar', 'en'] as const)(
    'has a box and fields that need no script to be there, in %s',
    async (lang) => {
      // As sent: the box with its field, its button and its fine print, which opens by itself.
      const tab = await open(browser, `${prefixOf(lang)}/tools/rtl-check`, { script: false })
      expect(await tab.locator('.scan-box #tool-url').count()).toBe(1)
      expect(await tab.locator('.scan-box form button[type="submit"]').count()).toBe(1)
      const body = tab.locator('#tool-note-keep')
      expect(await body.isVisible()).toBe(false)
      await tab.locator('#tool-note summary').click()
      expect(await body.isVisible()).toBe(true)
      await tab.context().close()
    },
    60_000,
  )

  it.each([
    '/tools',
    '/en/tools',
    '/tools/rtl-check',
    '/en/tools/rtl-check',
    '/tools/js-rendering-check',
    '/tools/whatsapp-link-generator',
    '/en/tools/whatsapp-link-generator',
    '/tools/robots-tester',
    '/en/tools/robots-tester',
    '/tools/hreflang-generator',
    '/tools/schema-generator',
  ])(
    'does not scroll sideways on a phone: %s',
    async (path) => {
      const tab = await open(browser, path, { phone: true })
      // Once the island runs, which is when the page has its final size.
      if (path !== '/tools' && path !== '/en/tools') {
        await tab.locator('astro-island:not([ssr])').first().waitFor()
      }
      expect(await overflowOf(tab)).toBeLessThanOrEqual(0)
      await tab.context().close()
    },
    60_000,
  )

  it('does not scroll sideways on a phone once the generators and the paste tool answer', async () => {
    const whatsapp = await open(browser, '/tools/whatsapp-link-generator', { phone: true })
    await whatsapp.locator('astro-island:not([ssr]) form[data-tool-kind]').waitFor()
    await whatsapp.selectOption('#wa-country', '966')
    await whatsapp.fill('#wa-number', '٠٥٠ ١٢٣ ٤٥٦٧')
    await whatsapp.fill('#wa-text', 'مرحباً، أريد الاستفسار عن طلبي رقم ١٢٣٤٥٦٧٨٩٠١٢٣٤٥٦٧٨٩٠')
    await whatsapp.click('form[data-tool-kind] button[type="submit"]')
    await whatsapp.locator('section[aria-label] pre').first().waitFor()
    expect(await overflowOf(whatsapp)).toBeLessThanOrEqual(0)
    await whatsapp.context().close()

    const robots = await open(browser, '/en/tools/robots-tester', { phone: true })
    await robots.locator('astro-island:not([ssr]) form[data-tool-kind]').waitFor()
    const rule = 'User-agent: *\nDisallow: /a-very-long-path-that-goes-on-and-on-and-on-and-on/'
    await robots.fill('#robots-file', [rule, rule, rule].join('\n'))
    await robots.fill(
      '#robots-url',
      'https://example.com/a-very-long-path-that-goes-on-and-on-and-on-and-on/and-on/',
    )
    await robots.click('form[data-tool-kind] button[type="submit"]')
    await robots.locator('section[aria-label]').waitFor()
    expect(await overflowOf(robots)).toBeLessThanOrEqual(0)
    await robots.context().close()
  }, 60_000)

  it('keeps the controls of a generator to the scale: 48 px for the button, 44 px for the secondary ones', async () => {
    const tab = await open(browser, '/tools/hreflang-generator', { phone: true })
    await tab.locator('astro-island:not([ssr]) form[data-tool-kind]').waitFor()
    const sizes = await tab.evaluate(() => {
      const height = (selector: string) =>
        [...document.querySelectorAll(selector)].map((node) => node.getBoundingClientRect().height)
      return {
        submit: height('form[data-tool-kind] button[type="submit"]'),
        // «Remove» on each row, and «Add a version».
        secondary: height('form[data-tool-kind] button.btn-white'),
        fields: height('form[data-tool-kind] input'),
      }
    })
    expect(sizes.submit).toEqual([48])
    expect(sizes.secondary.length).toBeGreaterThan(1)
    for (const size of sizes.secondary) expect(size).toBe(44)
    for (const size of sizes.fields) expect(size).toBe(48)
    await tab.context().close()
    // The fine print of a generator is its one line, with nothing to open: nothing is kept.
    const note = await open(browser, '/tools/whatsapp-link-generator')
    await note.locator('astro-island:not([ssr]) form[data-tool-kind]').waitFor()
    expect(await note.locator('#generator-note-line').textContent()).toBe(
      GENERATORS_UI.ar.common.local,
    )
    expect(await note.locator('#generator-note details').count()).toBe(0)
    await note.context().close()
  }, 60_000)
})

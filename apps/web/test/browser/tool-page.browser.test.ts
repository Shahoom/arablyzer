import { fileURLToPath } from 'node:url'
import { executablePathFor } from '@arablyzer/browser/engines'
import { serveSite, type FixtureSite } from '@arablyzer/fixtures'
import { TOOL_APP } from '@arablyzer/i18n/tool-app'
import type { Engine } from '@arablyzer/report-schema'
import { chromium, firefox, webkit, type Browser, type Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// A tool page (M2.6 R3) as a visitor uses it, in the browsers, apart from what its tool does
// (tool.browser.test.ts and generators.browser.test.ts): the box with the tool in its pill, the
// browsers or what the tool reads beside its button, the questions and the methodology that fold
// and open, and no page that scrolls sideways on a phone, before and after its tool answers. The
// site's own pages on loopback, and every request off the site refused (eslint.config.js).
// `pnpm test:browser` builds the site first.
const DIST = fileURLToPath(new URL('../../dist/', import.meta.url))
const TYPES = { chromium, firefox, webkit } as const
const PHONE = { width: 390, height: 844 }

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

/** A page of the site, every request off the site refused. */
async function open(
  browser: Browser,
  path: string,
  { script = true, phone = false }: { script?: boolean; phone?: boolean } = {},
): Promise<Page> {
  const context = await browser.newContext({
    javaScriptEnabled: script,
    ...(phone ? { viewport: PHONE } : {}),
  })
  await context.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin === site.origin) await route.fallback()
    else await route.abort('blockedbyclient')
  })
  const tab = await context.newPage()
  await tab.goto(site.url(path))
  return tab
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
      const path = `${lang === 'ar' ? '' : '/en'}/tools/rtl-check`
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

  it('shows the browsers a tool that renders opens the page in, and what the others read', async () => {
    const t = TOOL_APP.ar.form
    // The browsers: the three, by name.
    const renders = await open(browser, '/tools/js-rendering-check')
    const group = renders.locator(`[role="group"][aria-label="${t.engines}"]`)
    await group.waitFor()
    expect(await group.locator('span[lang="en"]').allTextContents()).toEqual([
      'Chromium',
      'Firefox',
      'WebKit',
    ])
    await renders.context().close()
    // A tool that reads the HTML as the server sends it opens no browser, and does not say so.
    const reads = await open(browser, '/tools/rtl-check')
    const what = reads.locator(`[role="group"][aria-label="${t.reads}"]`)
    await what.waitFor()
    expect(await what.textContent()).toBe('HTML')
    expect(await reads.locator(`[role="group"][aria-label="${t.engines}"]`).count()).toBe(0)
    await reads.context().close()
  }, 60_000)

  it('has the tool in the box’s pill, whose × goes to the full check', async () => {
    for (const lang of ['ar', 'en'] as const) {
      const tab = await open(browser, `${lang === 'ar' ? '' : '/en'}/tools/rtl-check`)
      const cross = tab.locator(`a[aria-label="${TOOL_APP[lang].form.fullScan}"]`)
      await cross.waitFor()
      expect(await cross.getAttribute('href')).toBe(`${lang === 'ar' ? '/' : '/en/'}#scan`)
      await tab.context().close()
    }
    // A generator is no check of a page: its pill has no ×.
    const generator = await open(browser, '/tools/whatsapp-link-generator')
    await generator.locator('astro-island:not([ssr]) form[data-tool-kind]').waitFor()
    expect(await generator.locator(`a[aria-label="${TOOL_APP.ar.form.fullScan}"]`).count()).toBe(0)
    await generator.context().close()
  }, 60_000)

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
})

import { fileURLToPath } from 'node:url'
import { executablePathFor } from '@arablyzer/browser/engines'
import { serveSite, type FixtureSite } from '@arablyzer/fixtures'
import {
  arabicSlug,
  decodeError,
  fixProductTitle,
  planRedirects,
  redirectConfig,
  robotsFile,
  sitemapXml,
  hreflangTags,
  productJsonLd,
  robotsTest,
  whatsAppLink,
} from '@arablyzer/generators'
import { GENERATORS_UI } from '@arablyzer/i18n/generators'
import { TEXT_TOOLS_UI } from '@arablyzer/i18n/text-tools'
import type { Engine } from '@arablyzer/report-schema'
import { chromium, firefox, webkit, type Browser, type Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The generators and the paste tool (M2.3b) as a visitor uses them, in the browsers: their
// answers must be the ones their code gives in Node, where the unit tests check them against
// the rules they name (packages/generators). The browsers' own data can differ, such as a
// currency's decimals, which each reads from its own CLDR. The site's own pages on loopback,
// and every request off the site refused (eslint.config.js). `pnpm test:browser` builds the
// site first.
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

/** A tool's page in Arabic, its island running, every request off the site refused. */
async function open(browser: Browser, slug: string): Promise<Page> {
  const context = await browser.newContext()
  await context.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin === site.origin) await route.fallback()
    else await route.abort('blockedbyclient')
  })
  const tab = await context.newPage()
  await tab.goto(site.url(`/tools/${slug}`))
  // Astro takes `ssr` off an island once it has hydrated it.
  await tab.locator('astro-island:not([ssr]) form[data-tool-kind]').waitFor()
  return tab
}

/** The texts the generator gave: each copy box's, in order. */
async function outputs(tab: Page): Promise<string[]> {
  await tab.locator('section[aria-label] pre, section[aria-label] [role="alert"]').first().waitFor()
  return tab.locator('section[aria-label] pre').allTextContents()
}

describe.each(ENGINES)('the generators in %s', (engine) => {
  let browser: Browser
  beforeAll(async () => {
    const executablePath = executablePathFor(engine)
    browser = await TYPES[engine].launch(executablePath === undefined ? {} : { executablePath })
  })
  afterAll(async () => {
    await browser.close()
  })

  it('writes the WhatsApp link Node writes, for a local number and a first message', async () => {
    const tab = await open(browser, 'whatsapp-link-generator')
    await tab.selectOption('#wa-country', '966')
    await tab.fill('#wa-number', '٠٥٠ ١٢٣ ٤٥٦٧')
    await tab.fill('#wa-text', 'مرحباً، أريد الاستفسار')
    await tab.click('form[data-tool-kind] button[type="submit"]')
    const expected = whatsAppLink({
      number: '٠٥٠ ١٢٣ ٤٥٦٧',
      country: '966',
      text: 'مرحباً، أريد الاستفسار',
      label: GENERATORS_UI.ar.whatsapp.labelDefault,
    })
    if (!expected.ok) throw new Error('the generator refuses the number')
    expect(await outputs(tab)).toEqual([expected.url, expected.html])
    await tab.context().close()
  }, 60_000)

  it('writes the hreflang tags Node writes, and names a code Google does not accept', async () => {
    const tab = await open(browser, 'hreflang-generator')
    await tab.fill('#href-0', 'https://example.com/')
    await tab.fill('#code-0', 'ar')
    await tab.fill('#href-1', 'https://example.com/en/')
    await tab.fill('#code-1', 'en-UK')
    await tab.fill('#x-default', 'https://example.com/')
    await tab.click('form[data-tool-kind] button[type="submit"]')
    const rows = [
      { href: 'https://example.com/', code: 'ar' },
      { href: 'https://example.com/en/', code: 'en-UK' },
    ]
    expect(await outputs(tab)).toEqual([hreflangTags(rows, 'https://example.com/').html])
    expect(await tab.locator('section[aria-label] [role="alert"]').allTextContents()).toEqual([
      GENERATORS_UI.ar.hreflang.problem('en-UK', 'en-GB'),
    ])
    await tab.context().close()
  }, 60_000)

  it('writes the product data Node writes, with the currency’s own decimals', async () => {
    for (const [price, currency] of [
      ['٤٫٥', 'KWD'],
      ['12.5', 'SAR'],
    ] as const) {
      const tab = await open(browser, 'schema-generator')
      await tab.fill('#product-name', 'بن عربي مختص')
      await tab.fill('#product-price', price)
      await tab.selectOption('#product-currency', currency)
      await tab.click('form[data-tool-kind] button[type="submit"]')
      const expected = productJsonLd({
        name: 'بن عربي مختص',
        price,
        currency,
        availability: 'InStock',
      })
      if (!expected.ok) throw new Error('the generator refuses the product')
      expect(await outputs(tab)).toEqual([expected.html])
      await tab.context().close()
    }
  }, 60_000)

  it('writes the slug Node writes, as it shows and as it is sent', async () => {
    const title = 'العُروض الخـاصة: خصم ٥٠٪!'
    const tab = await open(browser, 'arabic-slug-generator')
    await tab.fill('#field-title', title)
    await tab.fill('#field-base', 'https://example.com/offers')
    await tab.click('form[data-tool-kind] button[type="submit"]')
    const expected = arabicSlug(title)
    expect(await outputs(tab)).toEqual([
      expected.slug,
      expected.encoded,
      `https://example.com/offers/${expected.encoded}`,
    ])
    await tab.context().close()
  }, 60_000)

  it('fixes the title Node fixes, and says what it changed', async () => {
    const title = 'مســك أبيض شحن مجاني وخصم ٣٠٪ لفترة محدودة'
    const tab = await open(browser, 'title-fixer')
    await tab.fill('#field-title', title)
    await tab.click('form[data-tool-kind] button[type="submit"]')
    expect(await outputs(tab)).toEqual([fixProductTitle(title).title])
    const notes = await tab.locator('section[aria-label] li').allTextContents()
    expect(notes[0]).toContain(TEXT_TOOLS_UI.ar.title.changes.tatweel)
    await tab.context().close()
  }, 60_000)

  it('explains the Search Console message Node explains', async () => {
    const message = 'Crawled - currently not indexed'
    const tab = await open(browser, 'error-decoder')
    await tab.fill('#field-message', message)
    await tab.click('form[data-tool-kind] button[type="submit"]')
    await tab.locator('section[aria-label] li').first().waitFor()
    const shown = await tab.locator('section[aria-label]').innerText()
    expect(shown).toContain(decodeError(message)[0]?.ar.means)
    await tab.context().close()
  }, 60_000)

  it('writes the robots.txt Node writes, with the AI training crawlers blocked', async () => {
    const tab = await open(browser, 'robots-generator')
    await tab.fill('#field-paths', '/admin/\n/cart/')
    await tab.selectOption('#field-training', 'block')
    await tab.fill('#field-sitemaps', 'https://example.com/sitemap.xml')
    await tab.click('form[data-tool-kind] button[type="submit"]')
    const expected = robotsFile({
      blockPaths: ['/admin/', '/cart/'],
      training: 'block',
      search: 'allow',
      sitemaps: ['https://example.com/sitemap.xml'],
    })
    expect(await outputs(tab)).toEqual([expected.text])
    await tab.context().close()
  }, 60_000)

  it('writes the sitemap Node writes, and names the line it left out', async () => {
    const list = 'https://example.com/\nnot a link\nhttps://example.com/a 2026-03-05'
    const tab = await open(browser, 'sitemap-generator')
    await tab.fill('#field-urls', list)
    await tab.click('form[data-tool-kind] button[type="submit"]')
    expect(await outputs(tab)).toEqual([sitemapXml(list).xml])
    await tab.context().close()
  }, 60_000)

  it('writes the redirect config Node writes, with a chain made one hop', async () => {
    const list = '/a /b\n/b /c'
    const tab = await open(browser, 'redirect-generator')
    await tab.fill('#field-pairs', list)
    await tab.selectOption('#field-target', 'nginx')
    await tab.click('form[data-tool-kind] button[type="submit"]')
    expect(await outputs(tab)).toEqual([
      redirectConfig(planRedirects(list).pairs, 'nginx', 301, null),
    ])
    await tab.context().close()
  }, 60_000)

  it('judges a pasted robots.txt as Node does, naming the rule and its line', async () => {
    const robots = 'User-agent: Googlebot\nAllow: /\n\nUser-agent: *\nDisallow: /\n'
    const tab = await open(browser, 'robots-tester')
    await tab.fill('#robots-file', robots)
    await tab.fill('#robots-url', 'https://example.com/products/')
    await tab.selectOption('#robots-crawler', 'OAI-SearchBot')
    await tab.click('form[data-tool-kind] button[type="submit"]')
    const t = GENERATORS_UI.ar.robots
    const result = robotsTest(robots, 'https://example.com/products/', 'OAI-SearchBot')
    expect(result.allowed).toBe(false)
    const section = tab.locator('section[aria-label]')
    await section.waitFor()
    expect(await section.locator('p').allTextContents()).toEqual([
      t.blocked,
      `${t.rule} ${result.rule?.text ?? ''} ${t.line(result.rule?.line ?? 0)}`,
      t.group[result.group],
    ])
    await tab.context().close()
  }, 60_000)
})

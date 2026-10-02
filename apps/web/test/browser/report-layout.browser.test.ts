import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { executablePathFor } from '@arablyzer/browser/engines'
import { serveSite, type FixtureSite } from '@arablyzer/fixtures'
import type { Engine } from '@arablyzer/report-schema'
import { chromium, firefox, webkit, type Browser } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// The report page, drawn: what report.browser.test.ts, which scans it with Arablyzer, cannot say
// (M2.6 R4, rebuilt in R7). It does not scroll sideways at a phone's width, and no text is drawn off
// the screen, with a real golden report, with a report whose address, selectors and code are as
// long as they come, and while a scan runs; its accordions open and close from the keyboard and say
// so; the reading beam and the spinner stop when the visitor asks for less motion. And its layout is
// the owner's review of it (R7): the aside, the summary, first on a phone and sticky from lg beside
// a main column of at most 760 px; the summary a ring beside the severities on a phone; the address
// a quiet bubble, and the line under it plain text; the form that scans another page after the
// report, not stuck to the foot of the screen; the scan box a plain box under the reading beam, with
// no turning ring; and the reading order the order on the screen. The API is stood in for by fixed
// answers.
const DIST = fileURLToPath(new URL('../../dist/', import.meta.url))
const golden = (name: string) =>
  fileURLToPath(new URL(`../../../../fixtures/golden/reports/${name}`, import.meta.url))
const id = (name: string) => name.padEnd(22, '_').slice(0, 22)
const DONE = id('LayoutDone')
const LONG = id('LayoutLong')
const RUNNING = id('LayoutRunning')
const LOST = id('LayoutLost')
const FAILED = id('LayoutFailed')
const TOOL = id('LayoutTool')

// A browser starts, and a page hydrates, in the time a busy runner gives it: the default five
// seconds are for tests that do not drive one.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

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

const json = (value: unknown, status = 200) => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(value),
})
const summary = (scanId: string, state: string, tool?: string) => ({
  id: scanId,
  url: 'https://shop.example.com/ar/',
  state,
  createdAt: '2026-09-28T12:00:00.000Z',
  ...(tool === undefined ? {} : { tool }),
})

/** A report with the longest of everything a page can put in one: an address, selectors, code. */
async function longReport() {
  const report = JSON.parse(await readFile(golden('10-accessibility.json'), 'utf8')) as {
    target: { url: string; finalUrl: string }
    findings: { evidence: { selector?: string; snippet?: string } }[]
    rules: { status: string; findingsOmitted?: number }[]
  }
  const url = `https://shop.example.com/ar/categories/${'a-very-long-path-segment/'.repeat(8)}?session=${'0123456789abcdef'.repeat(8)}`
  report.target.url = url
  report.target.finalUrl = url
  for (const finding of report.findings) {
    finding.evidence.selector = `html > body > main#content.layout-container > div.${'card-wrapper-with-an-extremely-long-class-name-'.repeat(4)}0123456789 > a.link`
    if (finding.evidence.snippet !== undefined) {
      finding.evidence.snippet = `<div class="${'x'.repeat(260)}">`
    }
  }
  const failed = report.rules.find((rule) => rule.status === 'fail')
  if (failed !== undefined) failed.findingsOmitted = 17
  return report
}

let root = ''
let site: FixtureSite

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'arablyzer-report-layout-'))
  await cp(DIST, root, { recursive: true })
  const shell = async (file: string) => ({
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: await readFile(path.join(DIST, file), 'utf8'),
  })
  const ar = await shell('r/index.html')
  const en = await shell('en/r/index.html')
  const rtl = JSON.parse(await readFile(golden('04-rtl-layout.json'), 'utf8')) as unknown
  const events = [
    { type: 'queued', ahead: 0 },
    { type: 'started', engines: ['chromium', 'firefox', 'webkit'] },
    { type: 'robots', outcome: 'fetched', status: 200 },
    { type: 'page', status: 200, contentType: 'text/html', error: null },
    { type: 'crux', outcome: 'skipped' },
    { type: 'render-start', engine: 'chromium' },
  ]
  const routes: Record<string, unknown> = {}
  for (const scanId of [DONE, LONG, RUNNING, LOST, FAILED, TOOL]) {
    routes[`/r/${scanId}`] = ar
    routes[`/en/r/${scanId}`] = en
  }
  routes[`/api/scans/${DONE}`] = json(summary(DONE, 'complete'))
  routes[`/api/reports/${DONE}`] = json(rtl)
  routes[`/api/scans/${LONG}`] = json(summary(LONG, 'complete'))
  routes[`/api/reports/${LONG}`] = json(await longReport())
  routes[`/api/scans/${RUNNING}`] = json(summary(RUNNING, 'running'))
  routes[`/api/scans/${RUNNING}/events`] = {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' },
    body: events
      .map((event, index) => `id: ${index + 1}\ndata: ${JSON.stringify(event)}\n\n`)
      .join(''),
  }
  routes[`/api/scans/${LOST}`] = json({ error: 'not-found' }, 404)
  // A scan that failed has no report: the API says there is none.
  routes[`/api/scans/${FAILED}`] = json(summary(FAILED, 'failed'))
  routes[`/api/reports/${FAILED}`] = json({ error: 'not-found' }, 404)
  // A tool page's scan: the same report, shown as the tool's result.
  routes[`/api/scans/${TOOL}`] = json(summary(TOOL, 'complete', 'rtl-check'))
  routes[`/api/reports/${TOOL}`] = json(rtl)
  await writeFile(path.join(root, 'fixture.json'), JSON.stringify(routes))
  site = await serveSite(root, { compressText: true, cleanUrls: true })
})

afterAll(async () => {
  await site.close()
  await rm(root, { recursive: true, force: true })
})

describe('the report page as the server sends it', () => {
  // The page's Content-Security-Policy hashes its inline styles and scripts: a style attribute
  // would be refused. The island sets its own styles from script, which the policy allows.
  it.each(['r/index.html', 'en/r/index.html'])('has no style attribute in %s', async (file) => {
    const html = await readFile(path.join(DIST, file), 'utf8')
    expect(html).not.toMatch(/<[a-z][^>]*\sstyle=/i)
  })
})

describe.each(ENGINES)('the report page in %s', (engine) => {
  let browser: Browser

  beforeAll(async () => {
    const executablePath = executablePathFor(engine)
    browser = await TYPES[engine].launch({
      ...(executablePath === undefined ? {} : { executablePath }),
    })
  })
  afterAll(async () => {
    await browser.close()
  })

  /** Opens a page, at a phone's width unless told otherwise, and says when the app has drawn it. */
  async function open(
    scanId: string,
    lang: 'ar' | 'en',
    ready: string,
    options: { width?: number; height?: number; reducedMotion?: 'reduce' | 'no-preference' } = {},
  ) {
    const context = await browser.newContext({
      viewport: { width: options.width ?? 390, height: options.height ?? 844 },
      reducedMotion: options.reducedMotion ?? 'no-preference',
    })
    // The page's Content-Security-Policy is enforced: what it refuses is kept, for the tests to read.
    await context.addInitScript(() => {
      const refused: string[] = []
      ;(window as unknown as { refused: string[] }).refused = refused
      document.addEventListener('securitypolicyviolation', (event) => {
        refused.push(`${event.violatedDirective} ${event.blockedURI}`)
      })
    })
    // Every request off the site is refused, so nothing leaves the machine.
    await context.route('**/*', async (route) => {
      if (new URL(route.request().url()).origin === site.origin) await route.fallback()
      else await route.abort('blockedbyclient')
    })
    const tab = await context.newPage()
    await tab.goto(site.url(`${lang === 'ar' ? '' : '/en'}/r/${scanId}`))
    await tab.waitForSelector(ready, { timeout: 20_000 })
    return { tab, close: () => context.close() }
  }

  const sideways = (tab: Awaited<ReturnType<typeof open>>['tab']) =>
    tab.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

  /**
   * The text drawn outside the screen, in a box that neither scrolls nor clips it. In a right-to-left
   * page the page does not scroll to what runs past its right edge (the start of the line), so the
   * page's own width would not say it: a line of code that is cut off there is found here.
   */
  const outside = (tab: Awaited<ReturnType<typeof open>>['tab']) =>
    tab.evaluate(() => {
      const found: string[] = []
      const main = document.querySelector('main')
      if (main === null) return ['no main']
      const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT)
      const range = document.createRange()
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const text = node as Text
        if (text.data.trim() === '') continue
        let clipped = false
        for (let box = text.parentElement; box !== null && box !== document.body;) {
          if (getComputedStyle(box).overflowX !== 'visible') clipped = true
          box = box.parentElement
        }
        if (clipped) continue
        range.selectNodeContents(text)
        for (const rect of range.getClientRects()) {
          if (rect.width > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1)) {
            found.push(text.data.trim().slice(0, 40))
          }
        }
      }
      return found
    })

  describe.each(['ar', 'en'] as const)('in %s', (lang) => {
    it.each([
      ['a golden report', DONE, '#summary-title'],
      ['a report with the longest address, selectors and code', LONG, '#summary-title'],
      ['a scan that runs', RUNNING, '.reading-beam'],
      ['a scan that is not found', LOST, '#state-title'],
    ])('fits a 390 px screen with %s', async (_name, scanId, ready) => {
      const { tab, close } = await open(scanId, lang, ready)
      try {
        // Every accordion open, so the evidence, the code and the fix are all drawn.
        await tab.evaluate(() => {
          for (const button of document.querySelectorAll('button[aria-expanded="false"]')) {
            ;(button as HTMLElement).click()
          }
        })
        expect(await sideways(tab)).toBeLessThanOrEqual(0)
        expect(await outside(tab)).toEqual([])
      } finally {
        await close()
      }
    })
  })

  it('opens and closes a finding from the keyboard, and says which is open', async () => {
    const { tab, close } = await open(DONE, 'ar', '#summary-title')
    try {
      expect(await tab.locator('h1').count()).toBe(1)
      const buttons = tab.locator('section[aria-labelledby="found-title"] li button[aria-expanded]')
      // Golden report 04 fails three rules: the most severe is open, the others are not.
      expect(await buttons.count()).toBe(3)
      expect(await buttons.nth(0).getAttribute('aria-expanded')).toBe('true')
      const second = buttons.nth(1)
      expect(await second.getAttribute('aria-expanded')).toBe('false')
      const panel = tab.locator(`#${(await second.getAttribute('aria-controls')) ?? 'none'}`)
      expect(await panel.isHidden()).toBe(true)
      await second.focus()
      await tab.keyboard.press('Enter')
      expect(await second.getAttribute('aria-expanded')).toBe('true')
      expect(await panel.isVisible()).toBe(true)
      await tab.keyboard.press('Space')
      expect(await second.getAttribute('aria-expanded')).toBe('false')
      expect(await panel.isHidden()).toBe(true)
    } finally {
      await close()
    }
  })

  type Tab = Awaited<ReturnType<typeof open>>['tab']

  /** The boxes the layout tests compare, in page pixels. */
  const geometry = (tab: Tab) =>
    tab.evaluate(() => {
      const box = (node: Element | null) => {
        if (node === null) return null
        const rect = node.getBoundingClientRect()
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top + window.scrollY,
          bottom: rect.bottom + window.scrollY,
          width: rect.width,
          height: rect.height,
        }
      }
      const aside = document.querySelector('.page-aside')
      const main = document.querySelector('.page-main')
      return {
        columns: box(document.querySelector('.page-columns')),
        aside: box(aside),
        // What the aside holds, without the padding its sticky box keeps for focus rings.
        card: box(document.querySelector('.page-aside > section')),
        main: box(main),
        asideFirst: aside !== null && main !== null && !!(aside.compareDocumentPosition(main) & 4),
        position: aside === null ? null : getComputedStyle(aside).position,
        top: aside === null ? null : getComputedStyle(aside).top,
        header: box(document.querySelector('body > header'))?.height ?? 0,
      }
    })

  describe.each(['ar', 'en'] as const)('the finished report in %s', (lang) => {
    it('is the aside first and a main column of at most 760 px, side by side from lg', async () => {
      for (const width of [1024, 1280, 1440]) {
        const { tab, close } = await open(DONE, lang, '#summary-title', { width, height: 900 })
        try {
          const found = await geometry(tab)
          const where = `${lang} at ${width}`
          expect(found.asideFirst, `${where}: the aside comes first in the page`).toBe(true)
          expect(found.card?.width, `${where}: the aside`).toBeGreaterThanOrEqual(319.5)
          expect(found.card?.width, `${where}: the aside`).toBeLessThanOrEqual(360.5)
          expect(found.main?.width, `${where}: the main column`).toBeLessThanOrEqual(760.5)
          expect(found.columns?.width, `${where}: the content`).toBeLessThanOrEqual(1200.5)
          // Side by side, the main column where the line starts: the right in Arabic, the left in English.
          if (found.aside === null || found.main === null) throw new Error('no columns')
          if (lang === 'ar') expect(found.main.left, where).toBeGreaterThan(found.aside.right)
          else expect(found.main.right, where).toBeLessThan(found.aside.left)
          expect(
            Math.abs(found.aside.top - found.main.top),
            `${where}: they start together`,
          ).toBeLessThanOrEqual(8)
        } finally {
          await close()
        }
      }
    })

    it('sticks the aside 24 px under the header from lg, and not on a phone', async () => {
      const wide = await open(DONE, lang, '#summary-title', { width: 1440, height: 700 })
      try {
        const found = await geometry(wide.tab)
        expect(found.position).toBe('sticky')
        expect(found.top).toBe(`${found.header + 24}px`)
        await wide.tab.evaluate(() => {
          window.scrollTo(0, 500)
        })
        const stuck = await wide.tab.evaluate(
          () => document.querySelector('.page-aside')?.getBoundingClientRect().top,
        )
        expect(stuck).toBeGreaterThanOrEqual(found.header + 24 - 1)
        expect(stuck).toBeLessThanOrEqual(found.header + 24 + 1)
      } finally {
        await wide.close()
      }
      for (const width of [390, 768]) {
        const narrow = await open(DONE, lang, '#summary-title', { width })
        try {
          const found = await geometry(narrow.tab)
          const where = `${lang} at ${width}`
          expect(found.position, `${where}: not sticky`).toBe('static')
          // One column, the summary above the findings.
          if (found.aside === null || found.main === null) throw new Error('no columns')
          expect(found.aside.bottom, where).toBeLessThanOrEqual(found.main.top + 1)
          expect(found.aside.width, where).toBeCloseTo(found.main.width, 0)
        } finally {
          await narrow.close()
        }
      }
    })

    it('draws the second half of the aside once: in it from lg, after the checks below it', async () => {
      for (const width of [390, 1440]) {
        const { tab, close } = await open(DONE, lang, '#summary-title', { width, height: 900 })
        try {
          const found = await tab.evaluate(() => {
            const seen = (selector: string) =>
              [...document.querySelectorAll(selector)].filter((node) => node.checkVisibility())
            const actions = seen('main a.btn-grad, main button.btn-white')
            const categories = seen('main section[aria-labelledby^="categories-title"]')
            const place = (node: Element | undefined) =>
              node === undefined ? null : node.closest('.page-aside') !== null ? 'aside' : 'main'
            return {
              categories: categories.length,
              where: place(categories[0]),
              actionWhere: place(actions[0]),
              // The same button must not be on the page twice, seen or not, under one id.
              ids: [...document.querySelectorAll('[id]')]
                .map((node) => node.id)
                .filter((value, index, all) => all.indexOf(value) !== index),
              broken: [...document.querySelectorAll('[aria-labelledby],[aria-controls]')].flatMap(
                (node) =>
                  `${node.getAttribute('aria-labelledby') ?? ''} ${node.getAttribute('aria-controls') ?? ''}`
                    .split(' ')
                    .filter((ref) => ref !== '' && document.getElementById(ref) === null),
              ),
              copies: seen('main button.btn-white').length,
            }
          })
          const where = `${lang} at ${width}`
          expect(found.categories, `${where}: one list of categories`).toBe(1)
          expect(found.where, `${where}: categories`).toBe(width >= 1024 ? 'aside' : 'main')
          expect(found.actionWhere, `${where}: actions`).toBe(width >= 1024 ? 'aside' : 'main')
          expect(found.copies, `${where}: the copy button, once`).toBe(1)
          expect(found.ids, `${where}: duplicate ids`).toEqual([])
          expect(found.broken, `${where}: ids a label or control names that are not there`).toEqual(
            [],
          )
        } finally {
          await close()
        }
      }
    })

    it('puts the summary on a phone as a ring beside the severities', async () => {
      const { tab, close } = await open(DONE, lang, '#summary-title')
      try {
        const found = await tab.evaluate(() => {
          const card = document.querySelector('section[aria-labelledby="summary-title"]')
          const ring = card?.querySelector('svg')?.parentElement?.getBoundingClientRect()
          const pill = card?.querySelector('.sev')?.getBoundingClientRect()
          const title = document.querySelector('#summary-title')?.getBoundingClientRect()
          const box = card?.getBoundingClientRect()
          if (!ring || !pill || !title || !box) return null
          return {
            ring: [ring.width, ring.height],
            sameRow: ring.top < pill.bottom && pill.top < ring.bottom,
            // The ring is at the start of the line, the severities after it.
            ringFirst: document.dir === 'rtl' ? ring.left > pill.right : ring.right < pill.left,
            inside: ring.left >= box.left && ring.right <= box.right,
            // The heading is above the card, not a stack inside it.
            headingAbove: title.bottom <= box.top,
            tall: box.height,
          }
        })
        expect(found).not.toBeNull()
        expect(found?.ring, 'an 88 px ring').toEqual([88, 88])
        expect(found?.sameRow, 'the ring and the severities share a row').toBe(true)
        expect(found?.ringFirst).toBe(true)
        expect(found?.inside).toBe(true)
        expect(found?.headingAbove).toBe(true)
        // A ring beside the text, not a ring over a headline over pills: under 230 px with the link to the methodology.
        expect(found?.tall).toBeLessThan(230)
      } finally {
        await close()
      }
    })

    it('draws the address as a quiet bubble and the line under it as plain text', async () => {
      const { tab, close } = await open(DONE, lang, '#summary-title')
      try {
        const found = await tab.evaluate(() => {
          const head = document.querySelector('main header')
          const bubble = head?.querySelector('a[href^="http"]')
          const text = bubble?.querySelector('span[dir="ltr"]')
          const meta = head?.querySelector('p')
          if (!bubble || !text || !meta) return null
          const style = getComputedStyle(bubble)
          const line = getComputedStyle(meta)
          return {
            background: style.backgroundColor,
            image: style.backgroundImage,
            shadow: style.boxShadow,
            underline: style.textDecorationLine,
            direction: getComputedStyle(text).direction,
            logo: document.querySelectorAll('main .logo-mark').length,
            metaSize: line.fontSize,
            metaFont: line.fontFamily,
            metaHeight: meta.getBoundingClientRect().height,
            metaLineHeight: parseFloat(line.lineHeight),
            // Plain text: no pill, no tint, no mono, under the line.
            pills: [...meta.querySelectorAll('*')].filter(
              (node) =>
                getComputedStyle(node).backgroundColor !== 'rgba(0, 0, 0, 0)' ||
                getComputedStyle(node).fontFamily.includes('Mono'),
            ).length,
            text: meta.textContent,
          }
        })
        expect(found).not.toBeNull()
        // surface-2 is #f1f5f9; no gradient, no glow, no underline, read left to right.
        expect(found?.background).toBe('rgb(241, 245, 249)')
        expect(found?.image).toBe('none')
        expect(found?.shadow).toBe('none')
        expect(found?.underline).toBe('none')
        expect(found?.direction).toBe('ltr')
        expect(found?.logo, 'no lone logo square in the thread').toBe(0)
        expect(found?.metaSize).toBe('13px')
        expect(found?.metaFont).not.toContain('Mono')
        expect(found?.pills, 'no pill and no mono in the line').toBe(0)
        expect(found?.metaHeight, 'one line').toBeLessThan((found?.metaLineHeight ?? 0) * 1.5)
        expect(found?.text).toContain('1970-01-01')
        expect(found?.text).toContain('HTTP 200')
      } finally {
        await close()
      }
    })

    it('has one heading, 28 px on a phone and 40 px from lg, in solid ink', async () => {
      for (const [width, size] of [
        [390, '28px'],
        [1440, '40px'],
      ] as const) {
        const { tab, close } = await open(DONE, lang, '#summary-title', { width })
        try {
          const found = await tab.evaluate(() => {
            const heading = document.querySelector('h1')
            if (heading === null) return null
            const style = getComputedStyle(heading)
            return {
              count: document.querySelectorAll('h1').length,
              size: style.fontSize,
              weight: style.fontWeight,
              image: style.backgroundImage,
              fill: style.webkitTextFillColor,
            }
          })
          expect(found, `${lang} at ${width}`).toEqual({
            count: 1,
            size,
            weight: '600',
            image: 'none',
            fill: 'rgb(11, 27, 43)',
          })
        } finally {
          await close()
        }
      }
    })

    it('puts the form that scans another page after the report, not stuck to the screen', async () => {
      for (const width of [390, 1440]) {
        const { tab, close } = await open(DONE, lang, '#summary-title', { width, height: 700 })
        try {
          const before = await tab.evaluate(() => {
            const dock = document.querySelector('.report-dock')
            const lastCard = [...document.querySelectorAll('.page-main .card')].at(-1)
            if (dock === null || lastCard === undefined) return null
            return {
              position: getComputedStyle(dock).position,
              top: dock.getBoundingClientRect().top + window.scrollY,
              after: lastCard.getBoundingClientRect().bottom + window.scrollY,
              padding: getComputedStyle(document.documentElement).scrollPaddingBottom,
            }
          })
          const where = `${lang} at ${width}`
          expect(before, where).not.toBeNull()
          expect(before?.position, `${where}: not sticky`).toBe('static')
          expect(before?.top ?? 0, `${where}: after the last card`).toBeGreaterThan(
            before?.after ?? 0,
          )
          // Nothing pads the page's scroll for a bar that is no longer there.
          expect(['auto', '0px'], where).toContain(before?.padding)
          await tab.evaluate(() => {
            window.scrollTo(0, 300)
          })
          const moved = await tab.evaluate(
            () => document.querySelector('.report-dock')?.getBoundingClientRect().top,
          )
          expect(
            (before?.top ?? 0) - (moved ?? 0),
            `${where}: it scrolls with the page`,
          ).toBeCloseTo(300, 0)
        } finally {
          await close()
        }
      }
    })

    it('reads, and tabs, in the order of the screen on a phone', async () => {
      const { tab, close } = await open(DONE, lang, '#summary-title')
      try {
        // Every control a keyboard reaches that is drawn, in the order the Tab key takes them.
        const tops = await tab.evaluate(() =>
          [
            ...document.querySelectorAll(
              'main a[href], main button, main input, main [tabindex="0"]',
            ),
          ]
            .filter((node) => node.checkVisibility())
            .map((node) => Math.round(node.getBoundingClientRect().top + window.scrollY)),
        )
        expect(tops.length).toBeGreaterThan(8)
        const backwards = tops.filter((top, index) => index > 0 && top < (tops[index - 1] ?? 0) - 2)
        expect(backwards, 'a control that is higher on the screen than the one before it').toEqual(
          [],
        )
      } finally {
        await close()
      }
    })

    it('is drawn with no refusal by the page’s policy', async () => {
      for (const [scanId, ready] of [
        [DONE, '#summary-title'],
        [LONG, '#summary-title'],
        [RUNNING, '.reading-beam'],
        [FAILED, '#state-title'],
      ] as const) {
        const { tab, close } = await open(scanId, lang, ready)
        try {
          await tab.evaluate(() => {
            for (const button of document.querySelectorAll('button[aria-expanded="false"]')) {
              ;(button as HTMLElement).click()
            }
          })
          expect(
            await tab.evaluate(() => (window as unknown as { refused: string[] }).refused),
            `${lang} ${scanId}`,
          ).toEqual([])
        } finally {
          await close()
        }
      }
    })
  })

  describe.each(['ar', 'en'] as const)('a tool’s result in %s', (lang) => {
    it('has no ring and no categories, and the same columns', async () => {
      const { tab, close } = await open(TOOL, lang, '#summary-title', { width: 1440 })
      try {
        const found = await tab.evaluate(() => ({
          rings: document.querySelectorAll('.page-aside svg[viewBox="0 0 120 120"]').length,
          categories: document.querySelectorAll('section[aria-labelledby^="categories-title"]')
            .length,
          tool: document.querySelector('main header a[href*="/tools/"]')?.getAttribute('href'),
        }))
        expect(found.rings).toBe(0)
        expect(found.categories).toBe(0)
        expect(found.tool).toContain('/tools/rtl-check')
        expect((await geometry(tab)).asideFirst).toBe(true)
      } finally {
        await close()
      }
    })
  })

  describe.each(['ar', 'en'] as const)('the scan under way in %s', (lang) => {
    it('is the scan box in the aside, under the beam, with no turning ring and no dock', async () => {
      for (const width of [390, 1440]) {
        const { tab, close } = await open(RUNNING, lang, '.reading-beam', { width, height: 900 })
        try {
          const found = await tab.evaluate(() => {
            const box = document.querySelector('.reading-beam')
            const steps = document.querySelector('.page-main .card')
            const rect = box?.getBoundingClientRect()
            return {
              rings: document.querySelectorAll('.scan-ring').length,
              plain: box?.classList.contains('scan-box'),
              inAside: box?.closest('.page-aside') !== null,
              position: box === null ? null : getComputedStyle(box).position,
              docks: document.querySelectorAll('.report-dock').length,
              fixed: [...document.querySelectorAll('main *')].filter(
                (node) =>
                  ['fixed', 'sticky'].includes(getComputedStyle(node).position) &&
                  node.closest('.page-aside') === null,
              ).length,
              above:
                rect !== undefined && steps !== null
                  ? rect.bottom <= steps.getBoundingClientRect().top + 1
                  : null,
              h1: document.querySelector('h1')?.getBoundingClientRect().bottom,
              boxTop: rect?.top,
              size: getComputedStyle(document.querySelector('h1') ?? document.body).fontSize,
            }
          })
          const where = `${lang} at ${width}`
          expect(found.rings, `${where}: no turning ring`).toBe(0)
          expect(found.plain, `${where}: a plain scan box`).toBe(true)
          expect(found.inAside, `${where}: the box is the aside`).toBe(true)
          expect(found.docks, `${where}: no dock`).toBe(0)
          expect(found.fixed, `${where}: nothing stuck to the screen but the aside`).toBe(0)
          expect(found.size, `${where}: the heading`).toBe(width >= 1024 ? '40px' : '28px')
          if (width < 1024) {
            expect(found.above, `${where}: the box comes before the steps`).toBe(true)
            expect(found.boxTop ?? 0, `${where}: under the heading`).toBeGreaterThan(found.h1 ?? 0)
          }
        } finally {
          await close()
        }
      }
    })
  })

  describe.each(['ar', 'en'] as const)('a scan that is not found or failed in %s', (lang) => {
    it('is one card, centred from lg, with the heading of any page', async () => {
      for (const [scanId, width, size] of [
        [FAILED, 1440, '40px'],
        [LOST, 1440, '40px'],
        [FAILED, 390, '28px'],
      ] as const) {
        const { tab, close } = await open(scanId, lang, '#state-title', { width })
        try {
          const found = await tab.evaluate(() => {
            const card = document.querySelector('section[aria-labelledby="state-title"]')
            const rect = card?.getBoundingClientRect()
            return {
              width: rect?.width,
              middle: rect === undefined ? 0 : (rect.left + rect.right) / 2,
              screen: document.documentElement.clientWidth,
              size: getComputedStyle(document.querySelector('h1') ?? document.body).fontSize,
              ring: document.querySelectorAll('main .scan-ring, main .logo-mark').length,
            }
          })
          const where = `${lang} ${scanId} at ${width}`
          expect(found.size, `${where}: the heading`).toBe(size)
          expect(found.ring, `${where}: no ring and no logo square`).toBe(0)
          if (width >= 1024) {
            expect(found.width, where).toBeLessThanOrEqual(640.5)
            expect(
              Math.abs(found.middle - found.screen / 2),
              `${where}: centred`,
            ).toBeLessThanOrEqual(2)
          } else {
            expect(found.width, where).toBeGreaterThan(width - 40)
          }
        } finally {
          await close()
        }
      }
    })
  })

  describe('motion', () => {
    const motion = (tab: Awaited<ReturnType<typeof open>>['tab']) =>
      tab.evaluate(() => {
        const beam = document.querySelector('.reading-beam')
        const spinner = [...document.querySelectorAll('ol li span')].find((node) =>
          node.className.includes('border-t-brand'),
        )
        // The piece of the box's track for the step under way pulses.
        const track = [...document.querySelectorAll('.reading-beam ol li')].find((node) =>
          node.className.includes('animate-pulse'),
        )
        return {
          beam: beam === null ? null : getComputedStyle(beam, '::after').display,
          beamAnimation: beam === null ? null : getComputedStyle(beam, '::after').animationName,
          spinner: spinner === undefined ? null : getComputedStyle(spinner).animationName,
          pulse: track === undefined ? null : getComputedStyle(track).animationName,
        }
      })

    it('sweeps the reading beam and turns the spinner while a scan runs', async () => {
      const { tab, close } = await open(RUNNING, 'ar', '.reading-beam')
      try {
        const shown = await motion(tab)
        expect(shown.beam).toBe('block')
        expect(shown.beamAnimation).not.toBe('none')
        expect(shown.spinner).toBe('spin')
        expect(shown.pulse).toBe('pulse')
      } finally {
        await close()
      }
    })

    it('draws no beam and turns no spinner when the visitor asks for less motion', async () => {
      const { tab, close } = await open(RUNNING, 'ar', '.reading-beam', {
        reducedMotion: 'reduce',
      })
      try {
        const shown = await motion(tab)
        expect(shown.beam).toBe('none')
        expect(shown.spinner).toBe('none')
        expect(shown.pulse).toBe('none')
      } finally {
        await close()
      }
    })
  })
})

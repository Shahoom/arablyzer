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
// (M2.6 R4). It does not scroll sideways at a phone's width, and no text is drawn off the screen,
// with a real golden report, with a report whose address, selectors and code are as long as they
// come, and while a scan runs; its accordions open and close from the keyboard and say so; and the
// reading beam and the spinner stop when the visitor asks for less motion. The API is stood in for
// by fixed answers.
const DIST = fileURLToPath(new URL('../../dist/', import.meta.url))
const golden = (name: string) =>
  fileURLToPath(new URL(`../../../../fixtures/golden/reports/${name}`, import.meta.url))
const id = (name: string) => name.padEnd(22, '_').slice(0, 22)
const DONE = id('LayoutDone')
const LONG = id('LayoutLong')
const RUNNING = id('LayoutRunning')
const LOST = id('LayoutLost')

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
const summary = (scanId: string, state: string) => ({
  id: scanId,
  url: 'https://shop.example.com/ar/',
  state,
  createdAt: '2026-09-28T12:00:00.000Z',
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
  for (const scanId of [DONE, LONG, RUNNING, LOST]) {
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
    options: { width?: number; reducedMotion?: 'reduce' | 'no-preference' } = {},
  ) {
    const context = await browser.newContext({
      viewport: { width: options.width ?? 390, height: 844 },
      reducedMotion: options.reducedMotion ?? 'no-preference',
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

  it('keeps the dock at the foot of the screen while the report scrolls', async () => {
    const { tab, close } = await open(DONE, 'ar', '#summary-title')
    try {
      const dock = tab.locator('.report-dock')
      expect(await dock.evaluate((node) => getComputedStyle(node).position)).toBe('sticky')
      await tab.evaluate(() => {
        window.scrollTo(0, 600)
      })
      const gap = await dock.evaluate(
        (node) => window.innerHeight - node.getBoundingClientRect().bottom,
      )
      expect(Math.abs(gap)).toBeLessThanOrEqual(1)
    } finally {
      await close()
    }
  })

  describe('motion', () => {
    const motion = (tab: Awaited<ReturnType<typeof open>>['tab']) =>
      tab.evaluate(() => {
        const beam = document.querySelector('.reading-beam')
        const spinner = [...document.querySelectorAll('ol li span')].find((node) =>
          node.className.includes('border-t-brand'),
        )
        return {
          beam: beam === null ? null : getComputedStyle(beam, '::after').display,
          beamAnimation: beam === null ? null : getComputedStyle(beam, '::after').animationName,
          spinner: spinner === undefined ? null : getComputedStyle(spinner).animationName,
        }
      })

    it('sweeps the reading beam and turns the spinner while a scan runs', async () => {
      const { tab, close } = await open(RUNNING, 'ar', '.reading-beam')
      try {
        const shown = await motion(tab)
        expect(shown.beam).toBe('block')
        expect(shown.beamAnimation).not.toBe('none')
        expect(shown.spinner).toBe('spin')
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
      } finally {
        await close()
      }
    })
  })
})

import { fileURLToPath } from 'node:url'
import { executablePathFor } from '@arablyzer/browser/engines'
import { serveSite, type FixtureSite } from '@arablyzer/fixtures'
import { chromium, type Browser, type Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The contrast of the text on the first screen of a page, from the pixels (M2.6 R6). The site is
// judged by its own contrast rule, and axe, which that rule runs, cannot read what is behind text
// when it is a gradient or a blurred light: the aurora of the home page and the glow of a tool's
// box. They are `incomplete` to it, never a failure, and R6 found three lines of text under 4.5:1
// that way (the home page's lead on the aurora at 3.6:1, the notes under a tool's box on its glow at
// 3.6:1, both measured by this test's method). So each page is drawn with its text invisible, and
// the pixels under every line of text are compared with the text's own colour: the worst pixel
// decides, 4.5:1, or 3:1 for large text (24 px, or 18.66 px and bold). Chromium alone: what is
// drawn behind the text does not depend on the engine. The site's own pages on loopback, and every
// request off the site refused (eslint.config.js). `pnpm test:browser` builds the site first.
const DIST = fileURLToPath(new URL('../../dist/', import.meta.url))

const PAGES = [
  '/',
  '/tools',
  '/tools/rtl-check',
  '/tools/whatsapp-link-generator',
  '/tools/robots-tester',
  '/knowledge',
  '/rules',
  '/rules/ar-letter-spacing',
  '/fix',
  '/fix/soft-404',
  '/glossary',
  '/glossary/ai-crawlers',
  '/bot',
  '/methodology',
  '/404',
]
const WIDTHS = [390, 1440]

let site: FixtureSite
let browser: Browser
let decoder: Page
beforeAll(async () => {
  site = await serveSite(DIST, { cleanUrls: true })
  const executablePath = executablePathFor('chromium')
  browser = await chromium.launch(executablePath === undefined ? {} : { executablePath })
  // One blank page decodes the screenshots: the pixels are read from a canvas.
  decoder = await (await browser.newContext()).newPage()
  await decoder.setContent('<canvas id="c"></canvas>')
}, 60_000)
afterAll(async () => {
  await browser.close()
  await site.close()
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
interface Measured {
  readonly text: string
  readonly ratio: number
  readonly need: number
}

/** The lines of text on the first screen of a page, and the worst contrast under each. */
async function measure(path: string, width: number): Promise<Measured[]> {
  let measured: Measured[] = []
  // A page that has not settled leaves its text drawn in the picture, and every ratio is 1: it is
  // drawn again.
  for (let attempt = 0; attempt < 3; attempt++) {
    const context = await browser.newContext({
      viewport: { width, height: width > 600 ? 900 : 844 },
      reducedMotion: 'reduce',
      bypassCSP: true,
    })
    await context.route('**/*', async (route) => {
      if (new URL(route.request().url()).origin === site.origin) await route.fallback()
      else await route.abort('blockedbyclient')
    })
    const tab = await context.newPage()
    await tab.goto(site.url(path))
    await tab.evaluate(() => document.fonts.ready)
    await tab.waitForTimeout(500)
    const lines: Line[] = await tab.evaluate(() => {
      const found: Line[] = []
      const height = window.innerHeight
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const text = (node.nodeValue ?? '').replace(/\s+/g, ' ').trim()
        const element = node.parentElement
        if (text === '' || element === null) continue
        // Text that is not drawn: hidden, for a screen reader alone, or a decoration.
        if (element.closest('script,style,noscript,[aria-hidden="true"],.sr-only,[hidden]'))
          continue
        const style = getComputedStyle(element)
        if (style.visibility === 'hidden' || style.display === 'none') continue
        if (Number(style.opacity) === 0) continue
        // Text in a closed disclosure (the header's menu sheet) has no box on the page.
        if (!element.checkVisibility()) continue
        // Gradient text: clipped to the letters, its stops held above 4.5:1 by test/tokens.test.ts.
        if (style.webkitTextFillColor === 'rgba(0, 0, 0, 0)') continue
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const box of range.getClientRects()) {
          // Only what is drawn: a line of code in a block that scrolls sideways (the bot's page,
          // since its first screen holds one on a phone) runs on past the block's edge, where the
          // page's own ground shows, and a box that clips its content shows no more than itself.
          let left = box.left
          let top = box.top
          let right = box.right
          let bottom = box.bottom
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
          if (right - left <= 1 || bottom - top <= 1 || bottom < 0 || top > height) continue
          found.push({
            text: text.slice(0, 40),
            x: left,
            y: top,
            w: right - left,
            h: bottom - top,
            color: style.color,
            size: parseFloat(style.fontSize),
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
    const picture = await tab.screenshot()
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
          // The last pixel of a box is the one before its far edge: a line clipped to a block of
          // code that scrolls ends at the block's edge, and the pixel past it is the page's own
          // ground (M2.6 R7: a rounded block 358 px wide put every third column on that edge).
          const x1 = Math.min(image.width - 1, Math.ceil(box.x + box.w) - 1)
          const y1 = Math.min(image.height - 1, Math.ceil(box.y + box.h) - 1)
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
    measured = rows
    const unsettled =
      rows.length > 0 && rows.filter((row) => row.ratio < 1.05).length >= 0.9 * rows.length
    if (!unsettled) break
  }
  return measured
}

describe('the text of the first screen, from its pixels', () => {
  it.each(PAGES)(
    'has the contrast its size needs on %s, in both languages at 390 and 1440 px',
    async (path) => {
      for (const prefix of ['', '/en']) {
        for (const width of WIDTHS) {
          const rows = await measure(`${prefix}${path}`, width)
          // A page with no text on its first screen would pass for nothing.
          expect(rows.length, `${prefix}${path} at ${String(width)} px has text`).toBeGreaterThan(5)
          const under = rows
            .filter((row) => row.ratio < row.need)
            .map((row) => `${row.ratio.toFixed(2)}:1 "${row.text}"`)
          expect(under, `${prefix}${path} at ${String(width)} px`).toEqual([])
        }
      }
    },
    120_000,
  )
})

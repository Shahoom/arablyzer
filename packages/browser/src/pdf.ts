import { chromium } from 'playwright-core'
import { browserEnvironment, executablePathFor } from './engines'

/** The address the document is served at inside the browser; nothing answers at it but the route below. */
const DOCUMENT_URL = 'http://pdf.invalid/'
/** The policy the document is served under: no script, no request, only what the document carries in itself. */
const POLICY = "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:"

/** How long a PDF may take, browser start to the last byte. */
export const PDF_TIMEOUT_MS = 60_000
/** The most a PDF may weigh. */
export const PDF_MAX_BYTES = 8 * 1024 * 1024

export interface PdfOptions {
  /** Ends the render and the browser. */
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
  readonly maxBytes?: number
  readonly executablePath?: string
}

/**
 * A PDF of an HTML document, drawn by Chromium's print (M4.7): A4 and margins from the document's
 * own `@page` rules, backgrounds on, a tagged structure and an outline from its headings, so text
 * is selectable and headings are real headings. The document is untrusted in what it quotes (a
 * scanned site's words), so the browser holds it as it holds a page it scans, and more tightly:
 * no network at all (every request but the document's own is refused, and the proxy it is told to
 * use is a closed port), a policy with no script, no download, no service worker. The browser's
 * environment has none of this process's secrets. It is closed whatever happens.
 */
export async function renderPdf(html: string, options: PdfOptions = {}): Promise<Uint8Array> {
  const timeoutMs = options.timeoutMs ?? PDF_TIMEOUT_MS
  const executablePath = options.executablePath ?? executablePathFor('chromium')
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath === undefined ? {} : { executablePath }),
    timeout: timeoutMs,
    env: browserEnvironment(),
    proxy: { server: 'http://127.0.0.1:9', bypass: '<-loopback>' },
    args: [
      '--disable-quic',
      '--dns-prefetch-disable',
      '--disable-background-networking',
      '--no-pings',
      '--webrtc-ip-handling-policy=disable_non_proxied_udp',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    ],
  })
  const close = () => {
    void browser.close().catch(() => undefined)
  }
  options.signal?.addEventListener('abort', close, { once: true })
  const timer = setTimeout(close, timeoutMs)
  try {
    if (options.signal?.aborted === true) throw new Error('The PDF was stopped')
    const context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' })
    let served = false
    await context.route('**/*', async (route) => {
      if (!served && route.request().url() === DOCUMENT_URL) {
        served = true
        await route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          headers: { 'content-security-policy': POLICY },
          body: html,
        })
        return
      }
      await route.abort('blockedbyclient')
    })
    const page = await context.newPage()
    await page.goto(DOCUMENT_URL, { waitUntil: 'load', timeout: timeoutMs })
    await page.emulateMedia({ media: 'print' })
    // The fonts are in the document as data: URLs; the page is drawn once they are decoded.
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    const pdf = await page.pdf({
      preferCSSPageSize: true,
      printBackground: true,
      tagged: true,
      outline: true,
    })
    if (pdf.length > (options.maxBytes ?? PDF_MAX_BYTES)) throw new Error('too-large')
    return new Uint8Array(pdf)
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', close)
    close()
  }
}

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { executablePathFor } from '@arablyzer/browser/engines'
import { GUIDES_UI, REPORT, RULES_UI, SITE, TOOLS_UI } from '@arablyzer/i18n'
import { builtPages, isNoindexPage, type BuiltPage } from '@arablyzer/seo/audit'
import { ogImagePath } from '@arablyzer/seo/sitemap'
import { chromium } from 'playwright-core'
import { OG_HEIGHT, OG_WIDTH } from '../src/lib/og'
import { LIBRARY_DATA } from '../src/lib/rule-data'
import { TOOLS_DATA } from '../src/lib/tool-data'
import { cardHtml, tokensFrom, type Card, type CardFonts } from './og-card'

// Every indexable page's Open Graph image (BUILD-PLAN §6.5, M2.4c), drawn by Chromium after
// Astro builds the site: the card of og-card.ts, with the page's heading and description. The
// browser opens nothing but the card: every request is refused.

const WEB = new URL('../', import.meta.url)
const DIST = fileURLToPath(new URL('dist/', WEB))

const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
}
const decode = (text: string) =>
  text.replace(/&(?:amp|lt|gt|quot|#39|#x27);/g, (entity) => ENTITIES[entity] ?? entity)

/**
 * A built page's heading and description (our own HTML): its first <h1>, or its <title> without
 * the site's name for a page whose heading its script writes (a report), and its description.
 */
export function pageText(html: string): { title: string; description: string } {
  const text = (value: string) =>
    decode(value.replace(/<[^>]+>/g, ''))
      .replace(/\s+/g, ' ')
      .trim()
  const h1 = text(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '')
  const title =
    h1 !== ''
      ? h1
      : text(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '').replace(/ — Arablyzer$/, '')
  const description = decode(/<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? '')
  if (title === '') throw new Error('a page without a heading or a title has no card')
  return { title, description }
}

/** What the page is, above its title: a tool's category, a rule's id, the section. */
export function kickerOf(page: BuiltPage): Pick<Card, 'kicker' | 'kickerCode'> {
  const { lang } = page
  const arabic = page.path.replace(/^\/en(?=\/|$)/, '') || '/'
  const tool = /^\/tools\/([a-z0-9-]+)$/.exec(arabic)?.[1]
  if (tool !== undefined) {
    const data = TOOLS_DATA.tools.find((candidate) => candidate.slug === tool)
    if (data === undefined) throw new Error(`no tool ${tool}`)
    return { kicker: TOOLS_UI[lang].categories[data.category].name }
  }
  if (/^\/fix\/[a-z0-9-]+$/.test(arabic)) return { kicker: 'Search Console', kickerCode: true }
  if (/^\/glossary\/[a-z0-9-]+$/.test(arabic)) return { kicker: GUIDES_UI[lang].glossary.title }
  const rule = /^\/rules\/([a-z0-9-]+)$/.exec(arabic)?.[1]
  if (rule !== undefined) {
    if (!LIBRARY_DATA.rules.some((candidate) => candidate.id === rule))
      throw new Error(`no rule ${rule}`)
    return { kicker: rule, kickerCode: true }
  }
  switch (arabic) {
    case '/tools':
      return { kicker: TOOLS_UI[lang].directory.title }
    case '/rules':
      return { kicker: RULES_UI[lang].library.title }
    case '/fix':
      return { kicker: 'Search Console', kickerCode: true }
    case '/glossary':
      return { kicker: SITE[lang].footer.glossary }
    case '/methodology':
      return { kicker: SITE[lang].footer.methodology }
    case '/bot':
      return { kicker: 'ArablyzerBot', kickerCode: true }
    case '/':
      return { kicker: SITE[lang].statusBar }
    case '/r/':
      return { kicker: REPORT[lang].header.kicker }
    default:
      throw new Error(`no card kicker for ${page.path}: add one`)
  }
}

async function fonts(): Promise<CardFonts> {
  const file = (name: string) =>
    readFile(new URL(`node_modules/@fontsource/${name}.woff2`, WEB)).then(
      (buffer) => new Uint8Array(buffer),
    )
  const [arabic400, arabic600, latin400, latin600, mono600] = await Promise.all([
    file('ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal'),
    file('ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal'),
    file('ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-400-normal'),
    file('ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-600-normal'),
    file('ibm-plex-mono/files/ibm-plex-mono-latin-600-normal'),
  ])
  return { arabic400, arabic600, latin400, latin600, mono600 }
}

export async function drawCards(dist: string = DIST): Promise<number> {
  const tokens = tokensFrom(await readFile(new URL('src/styles/global.css', WEB), 'utf8'))
  const faces = await fonts()
  // Every page that is shared as a link: those to index, and a report, whose one page every
  // report's link opens; the 404 page is not.
  const pages = builtPages(dist).filter(
    (page) => !isNoindexPage(page.path) || /^\/(?:en\/)?r\/$/.test(page.path),
  )
  const host = (html: string) =>
    /<link rel="canonical" href="https:\/\/([^/"]+)/.exec(html)?.[1] ?? 'arablyzer'
  const executablePath = executablePathFor('chromium')
  const browser = await chromium.launch(executablePath === undefined ? {} : { executablePath })
  try {
    const context = await browser.newContext({
      viewport: { width: OG_WIDTH, height: OG_HEIGHT },
      deviceScaleFactor: 1,
    })
    // The card needs nothing from the network: its fonts are inline.
    await context.route('**/*', (route) => route.abort())
    const tab = await context.newPage()
    for (const page of pages) {
      const html = await readFile(path.join(dist, page.file), 'utf8')
      const card: Card = { lang: page.lang, ...kickerOf(page), ...pageText(html), host: host(html) }
      await tab.setContent(cardHtml(card, tokens, faces), { waitUntil: 'load' })
      await tab.evaluate('document.fonts.ready')
      const out = path.join(dist, ogImagePath(page.path))
      await mkdir(path.dirname(out), { recursive: true })
      await writeFile(out, await tab.screenshot({ type: 'png' }))
    }
  } finally {
    await browser.close()
  }
  return pages.length
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const count = await drawCards()
  console.log(`Open Graph images: ${String(count)} pages`)
}

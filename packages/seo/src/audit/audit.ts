import { collectPage } from '@arablyzer/collectors'
import { evaluatePage } from '@arablyzer/engine'
import { RULES } from '@arablyzer/rules'
import type { DefaultTreeAdapterMap } from 'parse5'
import type { Lang } from '../site'
import { isWithin, tagsOf, textOf, type Tag } from './dom'

type Node = DefaultTreeAdapterMap['node']
type Element = DefaultTreeAdapterMap['element']

export type AuditCheck =
  | 'lang-dir'
  | 'title'
  | 'description'
  | 'h1'
  | 'tool-first'
  | 'sections'
  | 'canonical'
  | 'hreflang'
  | 'json-ld'
  | 'indexable'
  | 'links'
  | 'own-rules'
  | 'reciprocal'
  | 'noindex'
  | 'content'

export interface AuditProblem {
  readonly check: AuditCheck
  readonly message: string
}

export interface PageProblem extends AuditProblem {
  /** The page's URL, or both URLs for a problem between two pages. */
  readonly page: string
}

export interface ExpectedPage {
  readonly lang: Lang
  /** The page's own URL, which its canonical must name. */
  readonly url: string
  readonly alternates: { readonly ar: string; readonly en: string }
  /** The site's origin: links to it must point to known pages. */
  readonly origin: string
  /** Paths of the pages the site has, in both languages. */
  readonly knownPaths: ReadonlySet<string>
}

/** robots.txt rules are left out: a rendered page has none to read. */
const PAGE_RULES = RULES.filter((rule) => !rule.needs.includes('robots'))

/** The §6.1 sections, in the order the template puts them. */
const SECTIONS = ['checks', 'example', 'fix', 'faq', 'links', 'about'] as const

/** The tool page template of BUILD-PLAN §6.1, its metadata, and our own rules. */
export function auditToolPage(html: string, expected: ExpectedPage): AuditProblem[] {
  const tags = tagsOf(html)
  const problems: AuditProblem[] = []
  const problem = (check: AuditCheck, message: string) => {
    problems.push({ check, message })
  }
  const all = (name: string) => tags.filter((tag) => tag.name === name)

  checkLangDir(tags, expected.lang, problem)

  const titles = all('title').filter((tag) => tag.inHead)
  if (titles.length !== 1 || titles.some((tag) => textOf(tag.node) === '')) {
    problem('title', `needs one <title> in <head> with text, found ${titles.length}`)
  }
  const descriptions = metas(tags, 'description')
  if (
    descriptions.length !== 1 ||
    descriptions.some((tag) => !tag.inHead || (tag.attr('content') ?? '').trim() === '')
  ) {
    problem('description', 'needs one meta description in <head>, with content')
  }

  // §6.1 items 1 and 2: the H1, its one-line description, then the tool, before any section.
  const h1s = all('h1')
  const h1 = h1s[0]
  if (h1s.length !== 1 || h1 === undefined || textOf(h1.node) === '') {
    problem('h1', `needs exactly one <h1> with text, found ${h1s.length}`)
  } else {
    const next = nextElement(h1.node)
    if (next?.tagName !== 'p' || textOf(next) === '') {
      problem('h1', 'the <h1> needs its one-line description, a <p>, right after it')
    }
  }
  const form = all('form').find((tag) =>
    all('input').some(
      (input) => input.attr('type')?.toLowerCase() === 'url' && isWithin(input.node, tag.node),
    ),
  )
  const firstSection = tags.find((tag) => tag.name === 'h2' || tag.name === 'section')
  if (form === undefined) problem('tool-first', 'no form with a URL field')
  else if (isHidden(form)) problem('tool-first', 'the tool form is hidden')
  else if (h1 !== undefined && form.order < h1.order) {
    problem('tool-first', 'the tool form comes before the <h1>; it belongs under it')
  } else if (firstSection !== undefined && firstSection.order < form.order) {
    problem('tool-first', 'the tool form comes after a section; it belongs above the fold')
  }

  checkSections(tags, problem)
  checkCanonical(tags, expected.url, problem)
  for (const message of hreflangProblems(tags, expected.alternates)) problem('hreflang', message)
  checkJsonLd(tags, expected, problem)

  for (const meta of [...metas(tags, 'robots'), ...metas(tags, 'googlebot')]) {
    if (isNoindex(meta)) {
      problem(
        'indexable',
        `tool pages must be indexable: <meta content="${meta.attr('content') ?? ''}">`,
      )
    }
  }

  checkLinks(tags, expected, problem)

  for (const failure of ownRuleFailures(html, expected.url)) problem('own-rules', failure)
  return problems
}

/** Both languages of one page: each audited, and each naming the other the same way. */
export function auditPair(
  ar: { readonly html: string; readonly expected: ExpectedPage },
  en: { readonly html: string; readonly expected: ExpectedPage },
): PageProblem[] {
  const problems: PageProblem[] = []
  for (const { html, expected } of [ar, en]) {
    for (const found of auditToolPage(html, expected))
      problems.push({ page: expected.url, ...found })
  }
  const declared = (html: string) =>
    alternateLinks(tagsOf(html))
      .map(({ hreflang, href }) => `${hreflang} ${href}`)
      .sort()
      .join('\n')
  if (declared(ar.html) !== declared(en.html)) {
    problems.push({
      page: `${ar.expected.url} ↔ ${en.expected.url}`,
      check: 'reciprocal',
      message: 'the two pages do not declare the same hreflang alternates',
    })
  }
  return problems
}

/** User reports are never indexed and claim no canonical or alternates (BUILD-PLAN §6.5). */
export function auditReportPage(html: string, lang: Lang): AuditProblem[] {
  const tags = tagsOf(html)
  const problems: AuditProblem[] = []
  const problem = (check: AuditCheck, message: string) => {
    problems.push({ check, message })
  }
  checkLangDir(tags, lang, problem)
  // A robots meta counts only in <head>: a stray element before it (a tracking pixel, say)
  // closes the head, and the meta that lands in <body> is not read (M0.3 review).
  if (!metas(tags, 'robots').some((meta) => meta.inHead && isNoindex(meta))) {
    problem('noindex', 'report pages need <meta name="robots" content="noindex"> in <head>')
  }
  if (tags.some((tag) => tag.name === 'link' && relOf(tag).includes('canonical'))) {
    problem('canonical', 'report pages must not declare a canonical')
  }
  if (alternateLinks(tags).length > 0) problem('hreflang', 'report pages must not declare hreflang')
  return problems
}

type Report = (check: AuditCheck, message: string) => void

function checkLangDir(tags: readonly Tag[], lang: Lang, problem: Report): void {
  const html = tags.find((tag) => tag.name === 'html')
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  // Language tags and dir values are case-insensitive.
  if (html?.attr('lang')?.toLowerCase() !== lang || html.attr('dir')?.toLowerCase() !== dir) {
    problem(
      'lang-dir',
      `<html> needs lang="${lang}" dir="${dir}", has lang="${html?.attr('lang') ?? ''}" dir="${html?.attr('dir') ?? ''}"`,
    )
  }
}

function checkSections(tags: readonly Tag[], problem: Report): void {
  const inside = (section: Tag, name: string) =>
    tags.filter((tag) => tag.name === name && tag !== section && isWithin(tag.node, section.node))
  const sections = SECTIONS.map((id) => ({
    id,
    tag: tags.find((tag) => tag.name === 'section' && tag.attr('id') === id),
  }))
  const require = (id: (typeof SECTIONS)[number], ok: (tag: Tag) => boolean, what: string) => {
    const tag = sections.find((section) => section.id === id)?.tag
    if (tag === undefined) problem('sections', `missing <section id="${id}">`)
    else if (isHidden(tag)) problem('sections', `#${id} is hidden`)
    else if (!ok(tag)) problem('sections', `#${id} needs ${what}`)
  }
  const filled = (tag: Tag) => textOf(tag.node) !== ''

  const found = sections.flatMap(({ id, tag }) =>
    tag === undefined ? [] : [{ id, order: tag.order }],
  )
  if (found.some((section, i) => i > 0 && (found[i - 1]?.order ?? 0) > section.order)) {
    problem('sections', `sections must follow the §6.1 order: ${SECTIONS.join(', ')}`)
  }

  require('checks', (tag) =>
    inside(tag, 'li').length > 0 &&
    inside(tag, 'li').every(filled), 'a list of what the tool checks, with no empty item')
  require('example', (tag) =>
    inside(tag, 'pre').length >= 2 &&
    inside(tag, 'pre').every(filled), 'a wrong and a right code example')
  require('fix', (tag) =>
    inside(tag, 'pre').some(filled) &&
    textBesides(tag, [...inside(tag, 'h2'), ...inside(tag, 'pre')]) !==
      '', 'text on how to fix, with code (§6.1 item 5)')
  require('faq', (tag) =>
    inside(tag, 'h3').length > 0 &&
    inside(tag, 'h3').every(
      (question) => filled(question) && answered(question),
    ), 'questions (<h3>), each followed by its answer')
  require('links', (tag) => inside(tag, 'a').some((a) => a.attr('href') !== null), 'links')
  require('about', (tag) => {
    const times = inside(tag, 'time').filter((time) => isDate(time.attr('datetime') ?? ''))
    const dated = times.map((time) => time.node.parentNode).filter((node) => node !== null)
    const methodology = ['p', 'ul', 'ol']
      .flatMap((name) => inside(tag, name))
      .some((block) => filled(block) && !dated.some((node) => node === block.node))
    return times.length > 0 && methodology
  }, 'the methodology and a <time datetime> of the last update')
}

/** Each question is an <h3> followed by its answer: text, or an element with text that is not a heading. */
function answered(question: Tag): boolean {
  const siblings = question.node.parentNode?.childNodes ?? []
  for (const node of siblings.slice(siblings.indexOf(question.node) + 1)) {
    if (node.nodeName === '#comment') continue
    if (node.nodeName === '#text') {
      if (textOf(node) === '') continue
      return true
    }
    return 'tagName' in node && !/^h[1-6]$/.test(node.tagName) && textOf(node) !== ''
  }
  return false
}

function checkCanonical(tags: readonly Tag[], url: string, problem: Report): void {
  const canonicals = tags.filter((tag) => tag.name === 'link' && relOf(tag).includes('canonical'))
  if (canonicals.length !== 1) {
    problem('canonical', `needs exactly one canonical, found ${canonicals.length}`)
    return
  }
  const [canonical] = canonicals
  if (canonical?.inHead !== true) problem('canonical', 'the canonical must be in <head>')
  if (canonical?.attr('href') !== url) {
    problem(
      'canonical',
      `the canonical must be the page itself (${url}), not ${canonical?.attr('href') ?? ''}`,
    )
  }
}

function alternateLinks(
  tags: readonly Tag[],
): { hreflang: string; href: string; inHead: boolean }[] {
  return tags
    .filter(
      (tag) =>
        tag.name === 'link' && relOf(tag).includes('alternate') && tag.attr('hreflang') !== null,
    )
    .map((tag) => ({
      hreflang: (tag.attr('hreflang') ?? '').toLowerCase(),
      href: tag.attr('href') ?? '',
      inHead: tag.inHead,
    }))
}

function hreflangProblems(tags: readonly Tag[], alternates: ExpectedPage['alternates']): string[] {
  const expected: Readonly<Record<string, string>> = {
    ar: alternates.ar,
    en: alternates.en,
    'x-default': alternates.ar,
  }
  const links = alternateLinks(tags)
  const problems: string[] = []
  for (const [hreflang, href] of Object.entries(expected)) {
    const found = links.filter((link) => link.hreflang === hreflang)
    if (found.length !== 1) problems.push(`needs one hreflang="${hreflang}", found ${found.length}`)
    else if (found[0]?.href !== href) {
      problems.push(`hreflang="${hreflang}" must point to ${href}, not ${found[0]?.href ?? ''}`)
    }
  }
  for (const link of links) {
    if (!(link.hreflang in expected)) problems.push(`unexpected hreflang="${link.hreflang}"`)
    if (!link.inHead) problems.push(`hreflang="${link.hreflang}" must be in <head>`)
  }
  return problems
}

/** JSON-LD node, with the @context it is read with (its own, or its block's for @graph). */
interface Thing {
  readonly node: Record<string, unknown>
  readonly context: unknown
}

function checkJsonLd(tags: readonly Tag[], expected: ExpectedPage, problem: Report): void {
  const things: Thing[] = []
  for (const script of tags.filter((tag) => tag.name === 'script')) {
    if ((script.attr('type') ?? '').trim().toLowerCase() !== 'application/ld+json') continue
    let data: unknown
    try {
      data = JSON.parse(textOf(script.node))
    } catch {
      problem('json-ld', 'a JSON-LD block is not valid JSON')
      continue
    }
    for (const block of [data].flat()) {
      if (!isObject(block)) continue
      const graph = Array.isArray(block['@graph']) ? (block['@graph'] as unknown[]) : [block]
      for (const node of graph) {
        if (isObject(node)) things.push({ node, context: node['@context'] ?? block['@context'] })
      }
    }
  }
  const ofType = (...types: string[]) =>
    things.filter(({ node }) => [node['@type']].flat().some((type) => types.includes(String(type))))

  const apps = ofType('WebApplication', 'SoftwareApplication')
  const [app] = apps
  if (apps.length !== 1 || app === undefined) {
    problem('json-ld', `needs one WebApplication, found ${apps.length}`)
  } else {
    const { node } = app
    if (!isSchemaOrg(app.context))
      problem('json-ld', 'the WebApplication needs "@context": "https://schema.org"')
    if (typeof node.name !== 'string' || node.name.trim() === '')
      problem('json-ld', 'the WebApplication needs a name')
    if (node.url !== expected.url)
      problem('json-ld', `the WebApplication url must be ${expected.url}`)
    if (typeof node.inLanguage !== 'string' || node.inLanguage.toLowerCase() !== expected.lang) {
      problem('json-ld', `the WebApplication inLanguage must be "${expected.lang}"`)
    }
    if (node.isAccessibleForFree !== undefined && node.isAccessibleForFree !== true) {
      problem('json-ld', 'the tools are free: isAccessibleForFree cannot be false')
    }
    const offers = [node.offers].flat().filter((offer) => offer !== undefined)
    if (offers.length === 0 || !offers.every((offer) => isObject(offer) && isZero(offer.price))) {
      problem(
        'json-ld',
        'the WebApplication needs offers, every one with price 0: the tools are free',
      )
    }
  }

  const crumbs = ofType('BreadcrumbList')
  const [crumb] = crumbs
  if (crumbs.length !== 1 || crumb === undefined) {
    problem('json-ld', `needs one BreadcrumbList, found ${crumbs.length}`)
    return
  }
  if (!isSchemaOrg(crumb.context))
    problem('json-ld', 'the BreadcrumbList needs "@context": "https://schema.org"')
  const items = Array.isArray(crumb.node.itemListElement)
    ? (crumb.node.itemListElement as unknown[])
    : []
  const urls = items.map((item) => (isObject(item) ? itemUrl(item.item) : null))
  const ordered = items.every(
    (item, index) =>
      isObject(item) &&
      item.position === index + 1 &&
      typeof item.name === 'string' &&
      item.name.trim() !== '',
  )
  if (
    items.length < 2 ||
    !ordered ||
    urls.some((url) => url === null || !onSite(url, expected.origin))
  ) {
    problem(
      'json-ld',
      'the BreadcrumbList needs items numbered from 1, each with a name and a URL on the site',
    )
  } else if (urls.at(-1) !== expected.url) {
    problem('json-ld', `the BreadcrumbList must end at the page itself (${expected.url})`)
  }
}

function checkLinks(tags: readonly Tag[], expected: ExpectedPage, problem: Report): void {
  // HTML resolves links against the first <base href>; it must keep them on the site.
  let base = expected.url
  const baseTag = tags.find((tag) => tag.name === 'base' && tag.attr('href') !== null)
  if (baseTag !== undefined) {
    try {
      base = new URL(baseTag.attr('href') ?? '', expected.url).href
    } catch {
      problem('links', `<base href> is not a URL: ${baseTag.attr('href') ?? ''}`)
    }
    if (!onSite(base, expected.origin)) problem('links', `<base href> leaves the site: ${base}`)
  }
  for (const tag of tags) {
    if (tag.name !== 'a' && tag.name !== 'area') continue
    const href = tag.attr('href')
    if (href === null) continue
    // Browsers read "\" as "/": "/\host" leaves the site while looking like a path.
    if (href.includes('\\')) {
      problem('links', `backslash in a link: ${href}`)
      continue
    }
    let url: URL
    try {
      url = new URL(href, base)
    } catch {
      problem('links', `not a URL: ${href}`)
      continue
    }
    if (url.protocol === 'mailto:' || url.protocol === 'tel:') continue
    if (url.protocol !== 'https:') problem('links', `links must be https: ${href}`)
    else if (url.origin === expected.origin && !expected.knownPaths.has(url.pathname)) {
      problem('links', `no such page on the site: ${url.pathname}`)
    }
  }
}

/** Our rules, on the page as a scan would read it: the site must pass its own checks. */
function ownRuleFailures(html: string, url: string): string[] {
  const page = collectPage({
    url,
    status: 200,
    headers: [['content-type', 'text/html; charset=utf-8']],
    body: new TextEncoder().encode(html),
  })
  const { results, findings } = evaluatePage(page, { rules: PAGE_RULES })
  return results
    .filter((result) => result.status === 'fail' || result.status === 'error')
    .map((result) => {
      const details = findings
        .filter((finding) => finding.ruleId === result.id)
        .map((finding) => finding.message.en)
      return `${result.id} ${result.status}${details.length === 0 ? '' : `: ${details.join(' / ')}`}`
    })
}

function metas(tags: readonly Tag[], name: string): Tag[] {
  return tags.filter((tag) => tag.name === 'meta' && tag.attr('name')?.toLowerCase() === name)
}

/** "noindex", or "none", which means noindex, nofollow. */
function isNoindex(meta: Tag): boolean {
  const tokens = (meta.attr('content') ?? '').toLowerCase().split(/[\s,]+/)
  return tokens.includes('noindex') || tokens.includes('none')
}

function relOf(tag: Tag): string[] {
  return (tag.attr('rel') ?? '').toLowerCase().split(/\s+/)
}

/** Hidden by the element or an ancestor, as far as markup says: hidden, aria-hidden, inline style. */
function isHidden(tag: Tag): boolean {
  for (
    let node: Node | null = tag.node;
    node !== null;
    node = 'parentNode' in node ? node.parentNode : null
  ) {
    if (!('attrs' in node)) continue
    for (const { name, value } of node.attrs) {
      if (name === 'hidden') return true
      if (name === 'aria-hidden' && value.trim().toLowerCase() === 'true') return true
      if (name === 'style' && /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(value))
        return true
    }
  }
  return false
}

/** The next element after an element, skipping text and comments. */
function nextElement(element: Element): Element | null {
  const siblings = element.parentNode?.childNodes ?? []
  for (const sibling of siblings.slice(siblings.indexOf(element) + 1)) {
    if ('tagName' in sibling) return sibling
  }
  return null
}

/** The text of a section outside the given elements (its heading, its code). */
function textBesides(section: Tag, parts: readonly Tag[]): string {
  let text = textOf(section.node)
  for (const part of parts) text = text.replace(textOf(part.node), '')
  return text.trim()
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSchemaOrg(context: unknown): boolean {
  return [context]
    .flat()
    .some((value) => typeof value === 'string' && /^https?:\/\/schema\.org\/?$/.test(value))
}

/** 0 as a number, or a decimal string of zeros ("0", "0.00"); not "0x0". */
function isZero(price: unknown): boolean {
  return price === 0 || (typeof price === 'string' && /^0+(?:\.0+)?$/.test(price.trim()))
}

function onSite(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin
  } catch {
    return false
  }
}

/** schema.org lets `item` be a URL or a Thing with an @id or url. */
function itemUrl(item: unknown): string | null {
  if (typeof item === 'string') return item
  if (isObject(item)) {
    const id = item['@id'] ?? item.url
    return typeof id === 'string' ? id : null
  }
  return null
}

/** A valid date, or a date and time, as <time datetime> allows (YYYY-MM-DD first). */
function isDate(value: string): boolean {
  const match =
    /^(\d{4}-\d{2}-\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(
      value,
    )
  const day = match?.[1]
  if (day === undefined) return false
  const date = new Date(`${day}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(day)
}

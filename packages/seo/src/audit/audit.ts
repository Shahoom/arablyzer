import { collectPage } from '@arablyzer/collectors'
import { evaluatePage } from '@arablyzer/engine'
import { RULES } from '@arablyzer/rules'
import type { Lang } from '../site'
import { isWithin, tagsOf, textOf, type Tag } from './dom'

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
    descriptions.some((tag) => (tag.attr('content') ?? '').trim() === '')
  ) {
    problem('description', `needs one meta description with content, found ${descriptions.length}`)
  }
  const h1s = all('h1')
  if (h1s.length !== 1 || h1s.some((tag) => textOf(tag.node) === '')) {
    problem('h1', `needs exactly one <h1> with text, found ${h1s.length}`)
  }

  const form = all('form').find((tag) =>
    all('input').some((input) => input.attr('type') === 'url' && isWithin(input.node, tag.node)),
  )
  const firstH2 = all('h2')[0]
  if (form === undefined) problem('tool-first', 'no form with a URL field')
  else if (firstH2 !== undefined && firstH2.order < form.order) {
    problem('tool-first', 'the tool form comes after a section heading; it belongs above the fold')
  }

  checkSections(tags, problem)
  checkCanonical(tags, expected.url, problem)
  for (const message of hreflangProblems(tags, expected.alternates)) problem('hreflang', message)
  checkJsonLd(tags, expected, problem)

  for (const meta of [...metas(tags, 'robots'), ...metas(tags, 'googlebot')]) {
    const tokens = (meta.attr('content') ?? '').toLowerCase().split(/[\s,]+/)
    if (tokens.includes('noindex') || tokens.includes('none')) {
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
  const noindex = metas(tags, 'robots').some((meta) =>
    (meta.attr('content') ?? '')
      .toLowerCase()
      .split(/[\s,]+/)
      .includes('noindex'),
  )
  if (!noindex) problem('noindex', 'report pages need <meta name="robots" content="noindex">')
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
  if (html?.attr('lang') !== lang || html.attr('dir') !== dir) {
    problem(
      'lang-dir',
      `<html> needs lang="${lang}" dir="${dir}", has lang="${html?.attr('lang') ?? ''}" dir="${html?.attr('dir') ?? ''}"`,
    )
  }
}

function checkSections(tags: readonly Tag[], problem: Report): void {
  const inside = (section: Tag, name: string) =>
    tags.filter((tag) => tag.name === name && tag !== section && isWithin(tag.node, section.node))
  const section = (id: string) =>
    tags.find((tag) => tag.name === 'section' && tag.attr('id') === id)
  const require = (id: string, ok: (tag: Tag) => boolean, what: string) => {
    const tag = section(id)
    if (tag === undefined) problem('sections', `missing <section id="${id}">`)
    else if (!ok(tag)) problem('sections', `#${id} needs ${what}`)
  }
  const bodyText = (tag: Tag) => {
    const headings = inside(tag, 'h2').map((heading) => textOf(heading.node))
    return headings.reduce((text, heading) => text.replace(heading, ''), textOf(tag.node)).trim()
  }
  require('checks', (tag) => inside(tag, 'li').length > 0, 'a list of what the tool checks')
  require('example', (tag) => inside(tag, 'pre').length >= 2, 'a wrong and a right code example')
  require('fix', (tag) => bodyText(tag) !== '', 'text on how to fix')
  // Each question is an <h3> followed by its answer, an element with text that is not a heading.
  const answered = (question: Tag) => {
    const siblings = question.node.parentNode?.childNodes ?? []
    const next = siblings
      .slice(siblings.indexOf(question.node) + 1)
      .find((node) => 'tagName' in node)
    return (
      next !== undefined &&
      'tagName' in next &&
      !/^h[1-6]$/.test(next.tagName) &&
      textOf(next) !== ''
    )
  }
  require('faq', (tag) =>
    inside(tag, 'h3').length > 0 &&
    inside(tag, 'h3').every(answered), 'questions (<h3>), each followed by its answer')
  require('links', (tag) => inside(tag, 'a').some((a) => a.attr('href') !== null), 'links')
  require('about', (tag) =>
    inside(tag, 'time').some((time) =>
      isDate(time.attr('datetime') ?? ''),
    ), 'the methodology and a <time datetime="YYYY-MM-DD"> of the last update')
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

function checkJsonLd(tags: readonly Tag[], expected: ExpectedPage, problem: Report): void {
  const nodes: Record<string, unknown>[] = []
  for (const script of tags.filter((tag) => tag.name === 'script')) {
    if ((script.attr('type') ?? '').trim().toLowerCase() !== 'application/ld+json') continue
    let data: unknown
    try {
      data = JSON.parse(textOf(script.node))
    } catch {
      problem('json-ld', 'a JSON-LD block is not valid JSON')
      continue
    }
    const graph = isObject(data) && Array.isArray(data['@graph']) ? data['@graph'] : [data]
    for (const node of graph.flat()) if (isObject(node)) nodes.push(node)
  }
  const ofType = (type: string) =>
    nodes.filter((node) => [node['@type']].flat().some((value) => value === type))

  const apps = [...ofType('WebApplication'), ...ofType('SoftwareApplication')]
  const [app] = apps
  if (apps.length !== 1 || app === undefined) {
    problem('json-ld', `needs one WebApplication, found ${apps.length}`)
  } else {
    if (typeof app.name !== 'string' || app.name.trim() === '')
      problem('json-ld', 'the WebApplication needs a name')
    if (app.url !== expected.url)
      problem('json-ld', `the WebApplication url must be ${expected.url}`)
    if (app.inLanguage !== expected.lang) {
      problem('json-ld', `the WebApplication inLanguage must be "${expected.lang}"`)
    }
    const free = [app.offers].flat().some((offer) => isObject(offer) && isZero(offer.price))
    if (!free)
      problem('json-ld', 'the WebApplication needs an offer with price 0: the tools are free')
  }

  const crumbs = ofType('BreadcrumbList')
  const [crumb] = crumbs
  if (crumbs.length !== 1 || crumb === undefined) {
    problem('json-ld', `needs one BreadcrumbList, found ${crumbs.length}`)
    return
  }
  const items = Array.isArray(crumb.itemListElement) ? (crumb.itemListElement as unknown[]) : []
  const urls = items.map((item) => (isObject(item) ? itemUrl(item.item) : null))
  const ordered = items.every(
    (item, index) => isObject(item) && item.position === index + 1 && typeof item.name === 'string',
  )
  if (items.length < 2 || !ordered || urls.some((url) => url === null)) {
    problem('json-ld', 'the BreadcrumbList needs items numbered from 1, each with a name and a URL')
  } else if (urls.at(-1) !== expected.url) {
    problem('json-ld', `the BreadcrumbList must end at the page itself (${expected.url})`)
  }
}

function checkLinks(tags: readonly Tag[], expected: ExpectedPage, problem: Report): void {
  for (const tag of tags) {
    if (tag.name !== 'a' && tag.name !== 'area') continue
    const href = tag.attr('href')
    if (href === null) continue
    let url: URL
    try {
      url = new URL(href, expected.url)
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

function relOf(tag: Tag): string[] {
  return (tag.attr('rel') ?? '').toLowerCase().split(/\s+/)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isZero(price: unknown): boolean {
  return price === 0 || (typeof price === 'string' && price.trim() !== '' && Number(price) === 0)
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

function isDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`)
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(date.getTime()) &&
    date.toISOString().startsWith(value)
  )
}

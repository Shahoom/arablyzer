import { KEBAB_ID } from '@arablyzer/report-schema'
import { ruleById } from '@arablyzer/rules'
import { toolBySlug, type CodeExample, type Tool } from '@arablyzer/tools'
import { formatDate } from './dates'
import { renderHead } from './head'
import { escapeHtml } from './html'
import { breadcrumbList, faqPage, webApplication } from './json-ld'
import { renderInline, renderMarkdown } from './markdown'
import { alternates, localePath, pageUrl, PATHS, type Lang, type Site } from './site'
import { ogImagePath } from './sitemap'
import { dirOf, otherLang, STRINGS } from './strings'

/**
 * A tool page, following the template of BUILD-PLAN §6.1 in order: H1 and description, the tool
 * itself before any section, what it checks, a live example, how to fix, FAQ, related links, and
 * the methodology with the last update.
 */
export function renderToolPage(tool: Tool, lang: Lang, site: Site): string {
  // The slug becomes URLs and attributes; defineTool checks it too, but not every Tool comes
  // through defineTool (M0.3 review).
  if (!KEBAB_ID.test(tool.slug))
    throw new TypeError(`Tool slugs are ASCII kebab-case: ${tool.slug}`)
  const t = STRINGS[lang]
  const copy = tool.copy[lang]
  const path = PATHS.tool(tool.slug)
  const url = pageUrl(site, lang, path)
  const trail = [
    { name: t.home, path: PATHS.home },
    { name: t.tools, path: PATHS.tools },
  ]
  const other = otherLang(lang)

  const title = `${copy.title} — Arablyzer`
  const head = renderHead({
    title,
    description: copy.description,
    canonical: url,
    openGraph: {
      title,
      description: copy.description,
      url,
      image: {
        url: `${site.origin}${ogImagePath(localePath(lang, path))}`,
        alt: title,
        width: 1200,
        height: 630,
      },
    },
    alternates: alternates(site, path),
    jsonLd: [
      webApplication({ name: copy.title, description: copy.description, url, lang }),
      breadcrumbList([
        ...trail.map((step) => ({ name: step.name, url: pageUrl(site, lang, step.path) })),
        { name: copy.title, url },
      ]),
      ...(copy.faq.length === 0
        ? []
        : [
            faqPage(
              copy.faq.map((entry) => ({
                question: renderInline(entry.question),
                answer: renderMarkdown(entry.answer),
              })),
            ),
          ]),
    ],
  })

  // Each rule by its title and its id, as the site's tool pages list them.
  const rules = tool.rules.map((id) => {
    const rule = ruleById(id)
    if (rule === undefined) throw new Error(`${tool.slug}: unknown rule ${id}`)
    return `${link(localePath(lang, PATHS.rule(id)), rule.copy[lang].title)} <code dir="ltr">${escapeHtml(id)}</code>`
  })
  const related = tool.related.map((slug) => {
    const other = toolBySlug(slug)
    if (other === undefined) throw new Error(`${tool.slug}: unknown related tool ${slug}`)
    return link(localePath(lang, PATHS.tool(slug)), other.copy[lang].title)
  })

  const body = [
    '<header>',
    `<a href="${escapeHtml(localePath(lang, PATHS.home))}">Arablyzer</a>`,
    `<a href="${escapeHtml(localePath(other, path))}" hreflang="${other}" lang="${other}" dir="${dirOf(other)}">${escapeHtml(t.otherLang)}</a>`,
    '</header>',
    '<main>',
    `<nav aria-label="${escapeHtml(t.breadcrumb)}"><ol>${trail
      .map((step) => `<li>${link(localePath(lang, step.path), step.name)}</li>`)
      .join('')}<li aria-current="page">${escapeHtml(copy.title)}</li></ol></nav>`,
    `<h1>${escapeHtml(copy.title)}</h1>`,
    `<p>${escapeHtml(copy.description)}</p>`,
    `<form action="${escapeHtml(localePath(lang, path))}" method="get">`,
    `<label for="url">${escapeHtml(t.urlLabel)}</label>`,
    '<input id="url" name="url" type="url" required placeholder="https://" dir="ltr">',
    `<button type="submit">${escapeHtml(t.check)}</button>`,
    '</form>',
    section('checks', t.sections.checks, [
      `<ul>${copy.checks.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ul>`,
    ]),
    section('example', t.sections.example, [
      `<h3>${escapeHtml(t.wrong)}</h3>`,
      code(copy.example.wrong),
      `<h3>${escapeHtml(t.right)}</h3>`,
      code(copy.example.right),
    ]),
    section('fix', t.sections.fix, [renderMarkdown(copy.fix)]),
    section(
      'faq',
      t.sections.faq,
      copy.faq.map(
        (entry) => `<h3>${renderInline(entry.question)}</h3>\n${renderMarkdown(entry.answer)}`,
      ),
    ),
    section('links', t.sections.links, [
      `<h3>${escapeHtml(t.rules)}</h3>`,
      list(rules),
      ...(related.length === 0 ? [] : [`<h3>${escapeHtml(t.otherTools)}</h3>`, list(related)]),
    ]),
    section('about', t.sections.about, [
      renderMarkdown(copy.methodology),
      `<p>${escapeHtml(t.updated)} <time datetime="${escapeHtml(tool.updated)}">${formatDate(tool.updated, lang)}</time></p>`,
    ]),
    '</main>',
    `<footer><p>Arablyzer — ${escapeHtml(t.tagline)}</p></footer>`,
  ]
  return document(lang, head, body)
}

export function document(lang: Lang, head: string, body: readonly string[]): string {
  return [
    '<!doctype html>',
    `<html lang="${lang}" dir="${dirOf(lang)}">`,
    '<head>',
    head,
    '</head>',
    '<body>',
    ...body,
    '</body>',
    '</html>',
    '',
  ].join('\n')
}

function section(id: string, heading: string, content: readonly string[]): string {
  return [`<section id="${id}">`, `<h2>${escapeHtml(heading)}</h2>`, ...content, '</section>'].join(
    '\n',
  )
}

function code(example: CodeExample): string {
  const language = example.lang === 'robots.txt' ? 'robots-txt' : example.lang
  return `<pre dir="ltr"><code class="language-${language}">${escapeHtml(example.code)}</code></pre>`
}

function link(href: string, text: string): string {
  return `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`
}

function list(items: readonly string[]): string {
  return `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`
}

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  collectCrux,
  collectPage,
  collectRobots,
  organizationalDomain,
  sitemapTargets,
  txtLookup,
  type CruxFacts,
  type DnsFacts,
  type RobotsFacts,
  type SitemapCheck,
  type SitemapFacts,
} from '@arablyzer/collectors'
import { evaluatePage } from '@arablyzer/engine'
import type { Redirect } from '@arablyzer/report-schema'
import { reportsOnly, RULES, ruleById, TOOL_ONLY } from '@arablyzer/rules'
import {
  locationOf,
  parseDnsExample,
  parseHttpExample,
  txtOf,
  type CodeExample,
  type Lang,
  type Tool,
} from '../src/index'

// BUILD-PLAN §6.1: the example on a tool's page is live. A tool that reads the HTML, robots.txt,
// DNS records, the response's headers and redirects, or real visitors' data from the Chrome UX
// Report (a JSON answer of its API, M2.3c) judges its examples as the page says; one that renders
// the page, or asks for its links, shows examples taken from its rules' own fixtures, which the
// engine's suites serve and scan for real (fixtures.test.ts, and fixtures.browser.test.ts in every
// engine), and whose wrong ones fail and right ones pass. Shared by the test and by
// scripts/check-copy.ts, which checks one tool's copy as it is written.

const PAGE_URL = 'https://example.com/'
const encode = (text: string) => new TextEncoder().encode(text)
const RULES_DIR = fileURLToPath(new URL('../../rules/src/rules/', import.meta.url))

const fold = (text: string) => text.replace(/\s+/g, ' ').trim()

/**
 * Whether the tool's examples come from its rules' fixtures: a rendered page, the answers of
 * the page's links, or those of the site's search, are not in the example's code.
 */
export function fromFixtures(tool: Tool): boolean {
  return tool.rules.some((id) => {
    const needs = ruleById(id)?.needs ?? []
    return (
      needs.includes('render') ||
      needs.includes('links') ||
      needs.some((need) => TOOL_ONLY.has(need)) ||
      // A text of 50 words or more is judged, longer than an excerpt of a page.
      id === 'ai-training-filters'
    )
  })
}

/**
 * A Chrome UX Report answer as the engine reads it: for the page's URL, or, when the answer names
 * an origin, for the origin the engine asks about when the URL has no data.
 */
function cruxAnswer(code: string): CruxFacts {
  const body: unknown = JSON.parse(code)
  const record = typeof body === 'object' && body !== null && 'record' in body ? body.record : null
  const key = typeof record === 'object' && record !== null && 'key' in record ? record.key : null
  const byOrigin = typeof key === 'object' && key !== null && 'origin' in key
  return byOrigin
    ? collectCrux({ url: { status: 404, body: null }, origin: { status: 200, body } })
    : collectCrux({ url: { status: 200, body } })
}

/**
 * The sitemaps as a robots.txt example shows them, as the engine would make them of a site that
 * robots.txt describes (fetchSitemaps): a check for each sitemap it would ask for, the first ones
 * it names as full URLs or /sitemap.xml when it names none, and the rest counted. The example
 * holds no sitemap, so what is asked for is what the example can say: a sitemap it names is one
 * that was read and is fine, which the rule that judges sitemaps reads, and a right example that it
 * failed would fail here; naming none, the site has no /sitemap.xml.
 */
export function exampleSitemaps(robots: RobotsFacts): SitemapFacts | undefined {
  if (robots.outcome !== 'fetched') return undefined
  const { fetch, unchecked } = sitemapTargets(robots.robots.sitemaps, PAGE_URL)
  return {
    named: robots.robots.sitemaps,
    checked: fetch.map((target): SitemapCheck =>
      target.named
        ? {
            outcome: 'fetched',
            url: target.url,
            named: true,
            status: 200,
            content: { kind: 'sitemap', format: 'urlset', entries: 1 },
            truncated: false,
          }
        : { outcome: 'unavailable', url: target.url, named: false, status: 404 },
    ),
    unchecked,
  }
}

/**
 * The tool's rules on an example: HTML as the page itself, robots.txt beside a plain page, an
 * HTTP example as the answers to a request for PAGE_URL (each redirect's Location is where the
 * next response came from, and the last response is the page, without a body), JSON as the
 * Chrome UX Report's answer about a plain page, and a DNS example as what DNS answers for the TXT
 * records of PAGE_URL's domain, beside a plain page: each name the rules read has the records the
 * example gives it, and none when it gives none.
 */
export function evaluateExample(tool: Tool, example: CodeExample) {
  if (example.lang === 'dns') {
    const records = parseDnsExample(example.code)
    const domain = organizationalDomain(new URL(PAGE_URL).hostname) ?? ''
    const dns: DnsFacts = {
      domain,
      txt: RULES.flatMap((rule) => {
        if (rule.txtName === undefined) return []
        const name = rule.txtName(domain)
        const answer = txtOf(records, name)
        return [txtLookup(name, answer.outcome, answer.records)]
      }),
    }
    const page = collectPage({
      url: PAGE_URL,
      status: 200,
      headers: [['content-type', 'text/html; charset=utf-8']],
      body: encode('<!doctype html><p>مرحبا</p>'),
    })
    return evaluatePage(page, { rules: RULES, ruleIds: tool.rules, dns }).results
  }
  if (example.lang === 'http') {
    const responses = parseHttpExample(example.code)
    const redirects: Redirect[] = []
    let url = PAGE_URL
    for (const response of responses.slice(0, -1)) {
      redirects.push({ url, status: response.status })
      url = new URL(locationOf(response), url).href
    }
    const last = responses.at(-1)
    const page = collectPage({
      url,
      status: last?.status ?? 200,
      headers: last?.headers ?? [],
      body: encode(''),
    })
    // The exchange has no robots.txt in it: the rules that read one see a site without one.
    const robots = collectRobots({
      url: new URL('/robots.txt', url).href,
      response: { status: 404, body: encode(''), truncated: false },
      errorCode: null,
    })
    return evaluatePage(page, { rules: RULES, ruleIds: tool.rules, redirects, robots }).results
  }
  if (example.lang === 'json') {
    const page = collectPage({
      url: PAGE_URL,
      status: 200,
      headers: [['content-type', 'text/html; charset=utf-8']],
      body: encode('<!doctype html><p>مرحبا</p>'),
    })
    return evaluatePage(page, { rules: RULES, ruleIds: tool.rules, crux: cruxAnswer(example.code) })
      .results
  }
  const html = example.lang === 'html' ? example.code : '<!doctype html><p>مرحبا</p>'
  const page = collectPage({
    url: PAGE_URL,
    status: 200,
    headers: [['content-type', 'text/html; charset=utf-8']],
    body: encode(html),
  })
  const robots: RobotsFacts | undefined =
    example.lang === 'robots.txt'
      ? collectRobots({
          url: `${PAGE_URL}robots.txt`,
          response: { status: 200, body: encode(example.code), truncated: false },
          errorCode: null,
        })
      : undefined
  const sitemap = robots === undefined ? undefined : exampleSitemaps(robots)
  return evaluatePage(page, {
    rules: RULES,
    ruleIds: tool.rules,
    ...(robots === undefined ? {} : { robots }),
    ...(sitemap === undefined ? {} : { sitemap }),
  }).results
}

/**
 * Whether an example can speak to a rule: robots.txt to the rules that read it, an HTTP exchange
 * to those that read the response, its headers or its redirects, DNS records to those that read
 * DNS, a Chrome UX Report answer to those that read it, HTML to the rest. A rule an example cannot
 * speak to, such as one that reads the certificate, need not pass it: it must not fail.
 */
export function speaksTo(example: CodeExample, ruleId: string): boolean {
  const reads = ruleById(ruleId)?.needs ?? []
  switch (example.lang) {
    case 'robots.txt':
      return reads.includes('robots')
    case 'http':
      return reads.includes('headers') || reads.includes('redirects') || reads.includes('response')
    case 'dns':
      return reads.includes('dns')
    case 'json':
      return reads.includes('crux')
    case 'html':
      return !reads.includes('robots') && !reads.includes('dns') && !reads.includes('crux')
  }
}

/** Every text file of a rule's fixtures whose directory starts with `kind`, whitespace folded. */
function fixtureTexts(ruleId: string, kind: 'wrong' | 'right'): string[] {
  const dir = `${RULES_DIR}${ruleId}/fixtures/`
  const texts: string[] = []
  const walk = (path: string) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(`${path}${entry.name}/`)
      else if (/\.(?:html|css|txt)$/.test(entry.name)) {
        texts.push(fold(readFileSync(`${path}${entry.name}`, 'utf8')))
      }
    }
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith(kind)) walk(`${dir}${entry.name}/`)
  }
  return texts
}

/** What is wrong with a tool's examples in one language: nothing, when the page tells the truth. */
export function exampleProblems(tool: Tool, lang: Lang): string[] {
  const { wrong, right } = tool.copy[lang].example
  const problems: string[] = []
  if (fromFixtures(tool)) {
    for (const [kind, example] of [
      ['wrong', wrong],
      ['right', right],
    ] as const) {
      const code = fold(example.code)
      const found = tool.rules.some((id) =>
        fixtureTexts(id, kind).some((text) => text.includes(code)),
      )
      if (!found) {
        problems.push(
          `the ${kind} example is not in a ${kind} fixture of ${tool.rules.join(', ')} (whitespace aside)`,
        )
      }
    }
    return problems
  }
  // A tool of information rules alone: its wrong example is one it can name nothing on, and its
  // right example one it reports on (payment-methods-detector: logos without names, and with).
  if (reportsOnly(tool.rules)) {
    for (const result of evaluateExample(tool, wrong)) {
      if (result.status === 'fail' || result.status === 'error') {
        problems.push(`${result.id} is ${result.status} on the wrong example, which names nothing`)
      }
    }
    const reported = evaluateExample(tool, right)
    if (!reported.some((result) => result.status === 'fail')) {
      problems.push(`none of ${tool.rules.join(', ')} reports on the right example`)
    }
    for (const result of reported) {
      if (result.status === 'error') problems.push(`${result.id} errs on the right example`)
    }
    return problems
  }
  if (!evaluateExample(tool, wrong).some((result) => result.status === 'fail')) {
    problems.push(`none of ${tool.rules.join(', ')} fails the wrong example`)
  }
  const evaluated = evaluateExample(tool, right)
  for (const result of evaluated) {
    if (result.status === 'fail' || result.status === 'error') {
      problems.push(`${result.id} ${result.status}s on the right example`)
    }
  }
  const spoken = evaluated.filter((result) => speaksTo(right, result.id))
  if (spoken.length === 0) problems.push('the right example speaks to none of the rules')
  for (const result of spoken) {
    if (result.status !== 'pass')
      problems.push(`${result.id} is ${result.status} on the right example`)
  }
  return problems
}

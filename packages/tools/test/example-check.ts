import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  collectCrux,
  collectPage,
  collectRobots,
  type CruxFacts,
  type RobotsFacts,
} from '@arablyzer/collectors'
import { evaluatePage } from '@arablyzer/engine'
import type { Redirect } from '@arablyzer/report-schema'
import { RULES, ruleById } from '@arablyzer/rules'
import { locationOf, parseHttpExample, type CodeExample, type Lang, type Tool } from '../src/index'

// BUILD-PLAN §6.1: the example on a tool's page is live. A tool that reads the HTML, robots.txt,
// the response's headers and redirects, or real visitors' data from the Chrome UX Report (a JSON
// answer of its API, M2.3c) judges its examples as the page says; one that renders
// the page shows examples taken from its rules' own fixtures, which the engine's browser suite
// renders in every engine (packages/engine, fixtures.browser.test.ts), and whose wrong ones fail
// and right ones pass. Shared by the test and by scripts/check-copy.ts, which checks one tool's
// copy as it is written.

const PAGE_URL = 'https://example.com/'
const encode = (text: string) => new TextEncoder().encode(text)
const RULES_DIR = fileURLToPath(new URL('../../rules/src/rules/', import.meta.url))

const fold = (text: string) => text.replace(/\s+/g, ' ').trim()

export function rendersPage(tool: Tool): boolean {
  return tool.rules.some((id) => ruleById(id)?.needs.includes('render') === true)
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
 * The tool's rules on an example: HTML as the page itself, robots.txt beside a plain page, an
 * HTTP example as the answers to a request for PAGE_URL (each redirect's Location is where the
 * next response came from, and the last response is the page, without a body), and JSON as the
 * Chrome UX Report's answer about a plain page.
 */
export function evaluateExample(tool: Tool, example: CodeExample) {
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
    return evaluatePage(page, { rules: RULES, ruleIds: tool.rules, redirects }).results
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
  return evaluatePage(page, {
    rules: RULES,
    ruleIds: tool.rules,
    ...(robots === undefined ? {} : { robots }),
  }).results
}

/**
 * Whether an example can speak to a rule: robots.txt to the rules that read it, an HTTP exchange
 * to those that read the response's headers or its redirects, a Chrome UX Report answer to those
 * that read it, HTML to the rest. A rule an example cannot speak to, such as one that reads the
 * certificate, need not pass it: it must not fail.
 */
export function speaksTo(example: CodeExample, ruleId: string): boolean {
  const reads = ruleById(ruleId)?.needs ?? []
  switch (example.lang) {
    case 'robots.txt':
      return reads.includes('robots')
    case 'http':
      return reads.includes('headers') || reads.includes('redirects')
    case 'json':
      return reads.includes('crux')
    case 'html':
      return !reads.includes('robots') && !reads.includes('crux')
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
  if (rendersPage(tool)) {
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

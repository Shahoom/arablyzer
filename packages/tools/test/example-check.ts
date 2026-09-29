import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { collectPage, collectRobots, type RobotsFacts } from '@arablyzer/collectors'
import { evaluatePage } from '@arablyzer/engine'
import { RULES, ruleById } from '@arablyzer/rules'
import type { CodeExample, Lang, Tool } from '../src/index'

// BUILD-PLAN §6.1: the example on a tool's page is live. A tool that reads the HTML or robots.txt
// judges its examples as the page says; one that renders the page shows examples taken from its
// rules' own fixtures, which the engine's browser suite renders in every engine
// (packages/engine, fixtures.browser.test.ts), and whose wrong ones fail and right ones pass.
// Shared by the test and by scripts/check-copy.ts, which checks one tool's copy as it is written.

const PAGE_URL = 'https://example.com/'
const encode = (text: string) => new TextEncoder().encode(text)
const RULES_DIR = fileURLToPath(new URL('../../rules/src/rules/', import.meta.url))

const fold = (text: string) => text.replace(/\s+/g, ' ').trim()

export function rendersPage(tool: Tool): boolean {
  return tool.rules.some((id) => ruleById(id)?.needs.includes('render') === true)
}

/** The tool's rules on an example: HTML as the page itself, robots.txt beside a plain page. */
export function evaluateExample(tool: Tool, example: CodeExample) {
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

/** Whether an example can speak to a rule: robots.txt to the rules that read it, HTML to the rest. */
function speaksTo(example: CodeExample, ruleId: string): boolean {
  const reads = ruleById(ruleId)?.needs ?? []
  return example.lang === 'robots.txt' ? reads.includes('robots') : !reads.includes('robots')
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

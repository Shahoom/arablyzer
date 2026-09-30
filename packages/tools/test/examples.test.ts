import { collectPage, collectRobots, type RobotsFacts } from '@arablyzer/collectors'
import { evaluatePage } from '@arablyzer/engine'
import { RULES } from '@arablyzer/rules'
import { describe, expect, it } from 'vitest'
import { TOOLS, type CodeExample, type Lang, type Tool } from '../src/index'

const PAGE_URL = 'https://example.com/'
const encode = (text: string) => new TextEncoder().encode(text)

/** The tool's rules on an example: HTML as the page itself, robots.txt beside a plain page. */
function statuses(tool: Tool, example: CodeExample) {
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
  const { results } = evaluatePage(page, {
    rules: RULES,
    ruleIds: tool.rules,
    ...(robots === undefined ? {} : { robots }),
  })
  return results.map((result) => result.status)
}

// BUILD-PLAN §6.1: the example on the page is live. The tool must judge it as the page says.
describe.each(
  TOOLS.flatMap((tool) => (['ar', 'en'] as const).map((lang) => [tool.slug, lang, tool] as const)),
)('%s (%s) example', (_slug, lang: Lang, tool) => {
  it('fails the wrong example', () => {
    expect(statuses(tool, tool.copy[lang].example.wrong)).toContain('fail')
  })

  it('passes the right example, with every rule applied', () => {
    expect(statuses(tool, tool.copy[lang].example.right).every((status) => status === 'pass')).toBe(
      true,
    )
  })
})

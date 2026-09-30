import { existsSync, readFileSync } from 'node:fs'
import { KEBAB_ID } from '@arablyzer/report-schema'

/** The languages a rule's example can be in: what its fixtures hold (BUILD-PLAN §6.2). */
export const EXAMPLE_LANGS = ['html', 'css', 'json', 'robots.txt'] as const
export type ExampleLang = (typeof EXAMPLE_LANGS)[number]

/**
 * The wrong and the right code on a rule's page (BUILD-PLAN §6.2, "a live example"): excerpts of
 * its own fixtures, which its tests run, so the page shows what the rule really judges
 * (test/examples.test.ts). The same in both languages, as the fixtures are.
 */
export interface RuleExample {
  readonly lang: ExampleLang
  readonly wrong: string
  readonly right: string
}

/** src/rules/, next to this file. */
const RULES_DIR = new URL('./rules/', import.meta.url)

/** rules/<id>/example.md, or null for a rule whose fixtures hold no code to show. */
export function loadRuleExample(id: string): RuleExample | null {
  if (!KEBAB_ID.test(id)) throw new TypeError(`Invalid rule id: ${id}`)
  const file = new URL(`${id}/example.md`, RULES_DIR)
  if (!existsSync(file)) return null
  return parseRuleExample(readFileSync(file, 'utf8'), `rules/${id}/example.md`)
}

/**
 * Two fenced blocks, "```html wrong" and "```html right", in one language, and nothing else: a
 * missing or empty half fails the build instead of shipping half an example.
 */
export function parseRuleExample(markdown: string, file: string): RuleExample {
  const fail: (message: string) => never = (message) => {
    throw new Error(`${file}: ${message}`)
  }
  const found: { wrong?: string; right?: string } = {}
  let lang: string | null = null
  let open: { kind: 'wrong' | 'right'; fence: string; lines: string[] } | null = null

  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    if (open !== null) {
      if (line.trim() === open.fence) {
        const code = open.lines.join('\n')
        if (code.trim() === '') fail(`the ${open.kind} example is empty`)
        found[open.kind] = code
        open = null
      } else {
        open.lines.push(line)
      }
      continue
    }
    if (line.trim() === '') continue
    const fence = /^(`{3,}|~{3,})\s*(.*?)\s*$/.exec(line)
    if (fence === null) return fail(`text outside the code: "${line.trim()}"`)
    const [, mark = '', info = ''] = fence
    const [blockLang = '', kind, ...rest] = info.split(/\s+/)
    if ((kind !== 'wrong' && kind !== 'right') || rest.length > 0) {
      return fail(`a block's info string is "${blockLang} wrong" or "${blockLang} right"`)
    }
    if (!(EXAMPLE_LANGS as readonly string[]).includes(blockLang)) {
      fail(`language "${blockLang}" is not one of ${EXAMPLE_LANGS.join(', ')}`)
    }
    if (lang !== null && blockLang !== lang) fail('both examples are in the same language')
    if (found[kind] !== undefined) fail(`the ${kind} example twice`)
    lang = blockLang
    open = { kind, fence: mark, lines: [] }
  }
  if (open !== null) fail(`the ${open.kind} example's block is not closed`)
  if (found.wrong === undefined) return fail('no wrong example')
  if (found.right === undefined) return fail('no right example')
  return { lang: lang as ExampleLang, wrong: found.wrong, right: found.right }
}

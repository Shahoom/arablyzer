import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { RULES, TOOL_ONLY } from '@arablyzer/rules'

const RULES_DIR = fileURLToPath(new URL('../../rules/src/rules/', import.meta.url))

export interface FixtureCase {
  readonly ruleId: string
  readonly fixture: string
  readonly dir: string
  /** From expect.json: related rules a wrong fixture also fails. */
  readonly alsoFails: readonly string[]
}

/** Rules that read the rendered page: without rendering, a scan leaves them out. */
export const RENDER_RULES: ReadonlySet<string> = new Set(
  RULES.filter((rule) => rule.needs.includes('render')).map((rule) => rule.id),
)

/**
 * Rules that ask the site's own search or other services (a tool's scan names them; a whole scan
 * never runs them), judged by their own tests on stand-in answers: a static fixture cannot.
 */
export const SEARCH_RULES: ReadonlySet<string> = new Set(
  RULES.filter((rule) => rule.needs.some((need) => TOOL_ONLY.has(need))).map((rule) => rule.id),
)

/**
 * Rules that judge a long text (the dialect needs 80 Arabic words, the AI-training filters
 * more): the golden pages are a few lines each, so these are judged by their own fixtures and
 * unit tests, not by the golden reports.
 */
export const LONG_TEXT_RULES: ReadonlySet<string> = new Set([
  'dialect-register',
  'ai-training-filters',
])

/**
 * Rules that read the Arabic NLP service's answer (M7): without the service they do not apply, so the
 * static fixtures cannot judge them. Their fixtures hold a stand-in answer (nlp.json) that the rule's own
 * test reads, and the engine's nlp.test.ts runs the whole path against a stand-in service.
 */
export const NLP_RULES: ReadonlySet<string> = new Set(
  RULES.filter((rule) => rule.needs.includes('nlp')).map((rule) => rule.id),
)

/** Rules that ask for a person's review: they never fail, so their fixtures need review or not. */
export const MANUAL_RULES: ReadonlySet<string> = new Set(
  RULES.filter((rule) => rule.manualCheck === true).map((rule) => rule.id),
)

/** Every rule's wrong and right fixture sites. */
export const FIXTURE_CASES: readonly FixtureCase[] = RULES.flatMap((rule) => {
  const root = `${RULES_DIR}${rule.id}/fixtures/`
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = `${root}${entry.name}`
      const expectFile = `${dir}/expect.json`
      const alsoFails = existsSync(expectFile)
        ? (JSON.parse(readFileSync(expectFile, 'utf8')) as { alsoFails: string[] }).alsoFails
        : []
      return { ruleId: rule.id, fixture: entry.name, dir, alsoFails }
    })
})

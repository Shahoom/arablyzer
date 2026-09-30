import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { RULES } from '@arablyzer/rules'

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

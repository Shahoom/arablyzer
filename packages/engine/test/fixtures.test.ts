import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { serveSite } from '@arablyzer/fixtures'
import { RULES } from '@arablyzer/rules'
import { describe, expect, it } from 'vitest'
import { scan } from '../src/index'
import { policyFor, schemaErrors } from './helpers'

const RULES_DIR = fileURLToPath(new URL('../../rules/src/rules/', import.meta.url))

interface FixtureCase {
  readonly ruleId: string
  readonly fixture: string
  readonly dir: string
  /** From expect.json: related rules a wrong fixture also fails. */
  readonly alsoFails: readonly string[]
}

const cases: FixtureCase[] = RULES.flatMap((rule) => {
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

// docs/design/phase-0.md §2: each wrong fixture fails its own rule alone; each right fixture
// passes all rules, so it can serve as a clean example on the rule's page.
describe('rule fixtures over HTTP', () => {
  it('has at least a wrong and a right fixture per rule', () => {
    expect(cases.length).toBeGreaterThanOrEqual(RULES.length * 2)
  })

  it.each(cases)('$ruleId/$fixture', async ({ ruleId, fixture, dir, alsoFails }) => {
    const site = await serveSite(dir)
    try {
      const report = await scan(site.url('/'), { policy: policyFor(site) })
      expect(schemaErrors(report)).toBe('')
      expect(report.scan).toMatchObject({ status: 'complete' })
      const failed = report.rules.filter((rule) => rule.status === 'fail').map((rule) => rule.id)
      if (fixture.startsWith('wrong')) {
        expect(failed.sort()).toEqual([ruleId, ...alsoFails].sort())
      } else {
        expect(failed).toEqual([])
        expect(report.rules.find((rule) => rule.id === ruleId)?.status).toBe('pass')
      }
    } finally {
      await site.close()
    }
  })
})

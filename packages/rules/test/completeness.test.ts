import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Category, KEBAB_ID, Severity } from '@arablyzer/report-schema'
import { describe, expect, it } from 'vitest'
import { placeholders, RULES, type Lang } from '../src/index'
import { fixtureNames, fixturesDir } from './helpers'

const RULES_DIR = fileURLToPath(new URL('../src/rules/', import.meta.url))
const SEMVER = /^\d+\.\d+\.\d+$/
const FIXTURE_NAME = /^(?:wrong|right)(?:-[a-z0-9]+)*$/
const LINK = /\]\(https?:\/\/[^)\s]+\)|https?:\/\/\S+/

const folders = readdirSync(RULES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

describe('the rule registry', () => {
  it('lists every rule folder once, sorted by id', () => {
    expect(RULES.map((rule) => rule.id)).toEqual(folders)
  })
})

// BUILD-PLAN §10: no rule without a wrong fixture, a right fixture, a unit test, reviewed Arabic
// copy and its rule-library page (the copy files).
describe.each(RULES.map((rule) => [rule.id, rule] as const))('rule %s', (id, rule) => {
  const dir = `${RULES_DIR}${id}/`

  it('has a kebab-case id, a semver version and valid metadata', () => {
    expect(id).toMatch(KEBAB_ID)
    expect(rule.version).toMatch(SEMVER)
    expect(Category.options).toContain(rule.category)
    expect(Severity.options).toContain(rule.severity)
    for (const criterion of rule.wcag ?? []) expect(criterion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(rule.needs.length).toBeGreaterThan(0)
    expect(rule.messages.length).toBeGreaterThan(0)
  })

  it('has its detector, unit test and copy files', () => {
    for (const file of ['rule.ts', 'rule.test.ts', 'copy.ar.md', 'copy.en.md']) {
      expect(existsSync(`${dir}${file}`), file).toBe(true)
    }
  })

  it('has at least one wrong and one right fixture, each a servable site', () => {
    const names = fixtureNames(id)
    expect(names.some((name) => name.startsWith('wrong'))).toBe(true)
    expect(names.some((name) => name.startsWith('right'))).toBe(true)
    for (const name of names) {
      expect(name).toMatch(FIXTURE_NAME)
      const site = `${fixturesDir(id)}${name}/`
      expect(existsSync(`${site}index.html`) || existsSync(`${site}fixture.json`), name).toBe(true)
    }
  })

  it('lists only other known rules in expect.json, and only for wrong fixtures', () => {
    for (const name of fixtureNames(id)) {
      const file = `${fixturesDir(id)}${name}/expect.json`
      if (!existsSync(file)) continue
      expect(name.startsWith('wrong'), `${name}/expect.json`).toBe(true)
      const expected = JSON.parse(readFileSync(file, 'utf8')) as unknown
      expect(Object.keys(expected as object)).toEqual(['alsoFails'])
      const { alsoFails } = expected as { alsoFails: unknown }
      expect(Array.isArray(alsoFails)).toBe(true)
      for (const other of alsoFails as unknown[]) {
        expect(
          RULES.some((known) => known.id === other && other !== id),
          String(other),
        ).toBe(true)
      }
    }
  })

  it.each(['ar', 'en'] as const)(
    'has %s copy for exactly its messages, with the same placeholders',
    (lang: Lang) => {
      const copy = rule.copy[lang]
      expect(Object.keys(copy.messages).sort()).toEqual([...rule.messages].sort())
      for (const message of rule.messages) {
        const template = copy.messages[message] ?? ''
        expect(placeholders(template).sort(), `${lang} ${message}`).toEqual(
          placeholders(rule.copy.ar.messages[message] ?? '').sort(),
        )
      }
      expect(copy.sections.references).toMatch(LINK)
    },
  )

  it('writes the Arabic copy in Arabic', () => {
    const { title, sections } = rule.copy.ar
    for (const text of [title, sections.why, sections.fix, sections.detect]) {
      expect(text).toMatch(/\p{Script=Arabic}/u)
    }
  })

  it('says whether the owner has reviewed the Arabic copy', () => {
    expect(typeof rule.copy.ar.reviewed).toBe('boolean')
  })
})

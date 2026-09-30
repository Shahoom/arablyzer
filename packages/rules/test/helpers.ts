import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  collectPage,
  collectRobots,
  type Header,
  type PageFacts,
  type RobotsFacts,
} from '@arablyzer/collectors'
import { loadFixtureConfig, resolveFixtureResponse } from '@arablyzer/fixtures'
import type { DetectorFinding, Evidence, Rule } from '../src/rule'

/** Rule tests read fixtures without HTTP; the engine test serves the same sites for real. */
export const FIXTURE_ORIGIN = 'http://fixture.test'

export function fixturesDir(ruleId: string): string {
  return fileURLToPath(new URL(`../src/rules/${ruleId}/fixtures/`, import.meta.url))
}

export function fixtureNames(ruleId: string): string[] {
  return readdirSync(fixturesDir(ruleId), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

/** Evidence for fixtures/<name>/ exactly as the fixture server would answer / and /robots.txt. */
export async function fixtureEvidence(ruleId: string, name: string): Promise<Evidence> {
  const root = `${fixturesDir(ruleId)}${name}`
  const config = await loadFixtureConfig(root)
  const page = await resolveFixtureResponse(root, config, '/')
  if (page.status >= 300 && page.status < 400) {
    throw new Error(`${ruleId}/${name}: redirects are exercised by the engine tests, not here`)
  }
  const robots = await resolveFixtureResponse(root, config, '/robots.txt')
  return {
    page: collectPage({
      url: `${FIXTURE_ORIGIN}/`,
      status: page.status,
      headers: headerList(page.headers),
      body: page.body,
    }),
    robots: collectRobots({
      url: `${FIXTURE_ORIGIN}/robots.txt`,
      response: { status: robots.status, body: robots.body, truncated: false },
      errorCode: null,
    }),
  }
}

function headerList(headers: Record<string, string | string[]>): Header[] {
  return Object.entries(headers).flatMap(([name, value]) =>
    (Array.isArray(value) ? value : [value]).map((item): Header => [name, item]),
  )
}

export interface HtmlPageOptions {
  readonly headers?: readonly Header[]
  readonly status?: number
  readonly url?: string
}

/** PageFacts for an inline HTML string. */
export function htmlPage(html: string, options: HtmlPageOptions = {}): PageFacts {
  return collectPage({
    url: options.url ?? `${FIXTURE_ORIGIN}/`,
    status: options.status ?? 200,
    headers: options.headers ?? [['content-type', 'text/html; charset=utf-8']],
    body: new TextEncoder().encode(html),
  })
}

export function evidenceOf(page: PageFacts, robots?: RobotsFacts): Evidence {
  return robots === undefined ? { page } : { page, robots }
}

/** A detector's findings as an array; detectors may yield them lazily. */
export function detectAll<M extends string>(
  rule: Rule<M>,
  evidence: Evidence,
): DetectorFinding<M>[] {
  return [...rule.detect(evidence)]
}

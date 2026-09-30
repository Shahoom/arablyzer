import { collectRobots, type RobotsFacts } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { AI_CRAWLERS } from '../../lib/ai-crawlers'
import {
  detectAll,
  evidenceOf,
  FIXTURE_ORIGIN,
  fixtureEvidence,
  htmlPage,
} from '../../../test/helpers'
import { rule } from './rule'

const ROBOTS_URL = `${FIXTURE_ORIGIN}/robots.txt`
const robots = (text: string, status = 200): RobotsFacts =>
  collectRobots({
    url: ROBOTS_URL,
    response: { status, body: new TextEncoder().encode(text), truncated: false },
    errorCode: null,
  })
const detect = (facts: RobotsFacts) =>
  detectAll(rule, evidenceOf(htmlPage('<p>عود</p>', { url: `${FIXTURE_ORIGIN}/oud` }), facts))

describe('robots-blocks-ai-search', () => {
  it('fires on the wrong fixture, naming the crawler and the line', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([
      {
        message: 'disallowed',
        url: ROBOTS_URL,
        snippet: 'Disallow: /',
        location: { line: 3 },
        values: {
          token: 'OAI-SearchBot',
          provider: 'OpenAI',
          rule: 'Disallow: /',
          line: 3,
          path: '/',
        },
        key: 'OAI-SearchBot',
      },
    ])
  })

  it.each(['right', 'right-open'])(
    'passes fixture %s: training crawlers are facts, not findings',
    async (name) => {
      const evidence = await fixtureEvidence(rule.id, name)
      expect(detectAll(rule, evidence)).toEqual([])
    },
  )

  it('checks every search crawler in the data file, and only those', () => {
    const search = AI_CRAWLERS.filter((crawler) => crawler.purpose === 'search').map(
      (crawler) => crawler.token,
    )
    expect(search).toEqual(['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot'])
    const findings = detect(robots('User-agent: *\nDisallow: /\n'))
    expect(findings.map((finding) => finding.values?.token)).toEqual(search)
    expect(
      detect(
        robots(
          'User-agent: ClaudeBot\nUser-agent: GPTBot\nUser-agent: ChatGPT-User\nDisallow: /\n',
        ),
      ),
    ).toEqual([])
  })

  it('reports an unreadable robots.txt once, not once per crawler', () => {
    expect(detect(robots('', 503))).toEqual([
      { message: 'server-error', url: ROBOTS_URL, values: { status: 503 } },
    ])
    const network = collectRobots({ url: ROBOTS_URL, response: null, errorCode: 'dns-failed' })
    expect(detect(network)).toEqual([{ message: 'unreachable', url: ROBOTS_URL }])
  })
})

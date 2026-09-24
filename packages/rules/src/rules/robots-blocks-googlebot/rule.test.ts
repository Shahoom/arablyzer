import { collectRobots, type RobotsFacts } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { evidenceOf, FIXTURE_ORIGIN, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const ROBOTS_URL = `${FIXTURE_ORIGIN}/robots.txt`
const robots = (text: string, status = 200): RobotsFacts =>
  collectRobots({
    url: ROBOTS_URL,
    response: { status, body: new TextEncoder().encode(text), truncated: false },
    errorCode: null,
  })
const detect = (facts: RobotsFacts, url = `${FIXTURE_ORIGIN}/products/oud`) =>
  rule.detect(evidenceOf(htmlPage('<p>عود</p>', { url }), facts))

describe('robots-blocks-googlebot', () => {
  it.each([
    ['wrong', 'disallowed'],
    ['wrong-googlebot', 'disallowed'],
    ['wrong-503', 'server-error'],
  ])('fires on fixture %s with message %s', async (name, message) => {
    const evidence = await fixtureEvidence(rule.id, name)
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(rule.detect(evidence).map((finding) => finding.message)).toEqual([message])
  })

  it.each(['right', 'right-404'])('passes fixture %s', async (name) => {
    const evidence = await fixtureEvidence(rule.id, name)
    expect(rule.detect(evidence)).toEqual([])
  })

  it('points at the blocking line of robots.txt', async () => {
    const [finding] = rule.detect(await fixtureEvidence(rule.id, 'wrong-googlebot'))
    expect(finding).toMatchObject({
      url: ROBOTS_URL,
      snippet: 'Disallow: /',
      location: { line: 3 },
      values: { rule: 'Disallow: /', line: 3, path: '/', group: 'specific' },
    })
  })

  it('follows Google: its own group wins, longest match wins, allow wins ties', () => {
    expect(
      detect(robots('User-agent: *\nDisallow: /\n\nUser-agent: Googlebot\nAllow: /\n')),
    ).toEqual([])
    expect(
      detect(robots('User-agent: Googlebot\nDisallow: /products/\nAllow: /products/oud\n')),
    ).toEqual([])
    expect(
      detect(robots('User-agent: Googlebot\nAllow: /products/\nDisallow: /products/oud\n')),
    ).toHaveLength(1)
    expect(detect(robots('User-agent: Googlebot-Image\nDisallow: /\n'))).toEqual([])
    expect(detect(robots('User-agent: *\nDisallow: /*oud$\n'))).toHaveLength(1)
  })

  it('treats 429 and network failures as blocking everything, 4xx as allowing everything', () => {
    expect(detect(robots('', 429)).map((finding) => finding.message)).toEqual(['server-error'])
    const network = collectRobots({ url: ROBOTS_URL, response: null, errorCode: 'timeout' })
    expect(detect(network).map((finding) => finding.message)).toEqual(['unreachable'])
    expect(detect(robots('User-agent: *\nDisallow: /\n', 404))).toEqual([])
  })
})

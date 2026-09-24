import { describe, expect, it } from 'vitest'
import { evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const detect = (html: string) => rule.detect(evidenceOf(htmlPage(html)))

describe('jsonld-syntax-error', () => {
  it('fires on a trailing comma and points at it', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(rule.detect(evidence)).toEqual([
      {
        message: 'trailing-comma',
        values: { block: 1, line: 12, column: 33, problem: 'trailing-comma' },
        selector: 'head > script',
        snippet: '"servesCuisine": "عماني",',
        location: { line: 12, column: 33 },
        key: '1',
      },
    ])
  })

  it('fires on an unescaped quote inside an Arabic name', async () => {
    const [finding] = rule.detect(await fixtureEvidence(rule.id, 'wrong-quote'))
    expect(finding).toMatchObject({
      message: 'unexpected-character',
      values: { block: 1, line: 11, column: 24, character: 'ا' },
      snippet: '"name": "مطعم "الأصيل" للمأكولات البحرية",',
    })
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(rule.detect(evidence)).toEqual([])
  })

  it('numbers blocks among JSON-LD scripts only, and reports each broken one', () => {
    const findings = detect(`<script>var a = 1,</script>
      <script type="application/ld+json">{"a": 1}</script>
      <script type="Application/LD+JSON; charset=utf-8">{"b": }</script>
      <script type="application/ld+json">[1,]</script><p>نص</p>`)
    expect(findings.map((finding) => [finding.values?.block, finding.message])).toEqual([
      [2, 'unexpected-character'],
      [3, 'trailing-comma'],
    ])
  })

  it('skips empty blocks and does not apply without JSON-LD', () => {
    expect(detect('<script type="application/ld+json">  \n </script><p>نص</p>')).toEqual([])
    expect(rule.appliesTo(htmlPage('<script type="application/ld+json"> </script><p>نص</p>'))).toBe(
      false,
    )
    expect(rule.appliesTo(htmlPage('<script>{"a":1,}</script><p>نص</p>'))).toBe(false)
  })
})

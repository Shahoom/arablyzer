import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const withViewport = (content: string) =>
  detectAll(rule, evidenceOf(htmlPage(`<head><meta name="viewport" content="${content}"></head>`)))

describe('viewport-missing', () => {
  it('fires when the page has no viewport tag', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([{ message: 'missing', selector: 'head' }])
  })

  it('fires on a fixed width, and points at the tag', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong-fixed'))).toEqual([
      {
        message: 'no-device-width',
        values: { content: 'width=1024' },
        selector: 'head > meta:nth-of-type(2)',
        snippet: '<meta name="viewport" content="width=1024" />',
        location: { line: 5, column: 5 },
      },
    ])
  })

  it.each(['right', 'right-scale'])('passes fixture %s', async (name) => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, name))).toEqual([])
  })

  it.each([
    'width=device-width',
    'WIDTH = Device-Width; initial-scale=1',
    'initial-scale=1.0, maximum-scale=5',
    'initial-scale=1 width=device-width',
  ])('accepts %j', (content) => {
    expect(withViewport(content)).toEqual([])
  })

  it.each(['width=1024, initial-scale=1', 'user-scalable=yes', '', 'width=100%'])(
    'rejects %j',
    (content) => {
      expect(withViewport(content)[0]?.message).toBe('no-device-width')
    },
  )

  it('stays linear on long runs of spaces, which a page could use to stall a scan', () => {
    const start = performance.now()
    expect(withViewport(`${' '.repeat(200_000)}x`)[0]?.message).toBe('no-device-width')
    expect(performance.now() - start).toBeLessThan(1000)
  })
})

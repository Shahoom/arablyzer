import type { UncompressedTextFact } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, renderedEvidence, renderedFacts } from '../../../test/helpers'
import { rule } from './rule'

// The browser suite renders the wrong and right fixtures in every engine; here the detector
// reads the text responses the render gzipped.
const text = (overrides: Partial<UncompressedTextFact> = {}): UncompressedTextFact => ({
  url: 'http://fixture.test/',
  type: 'document',
  mimeType: 'text/html',
  size: 3_667,
  gzipSize: 1_382,
  ...overrides,
})

const facts = (engine: 'chromium' | 'firefox', uncompressed: UncompressedTextFact[]) =>
  renderedFacts(engine, { compression: { checked: 3, uncompressed } })

describe('text-compression-missing', () => {
  it('fires on a text response gzip would make much smaller, once for every engine', () => {
    expect(
      detectAll(rule, renderedEvidence([facts('chromium', [text()]), facts('firefox', [text()])])),
    ).toEqual([
      {
        message: 'uncompressed',
        values: { url: 'http://fixture.test/', size: 3.6, gzipped: 1.3, saved: 2.2 },
        url: 'http://fixture.test/',
        engines: ['chromium', 'firefox'],
        key: 'http://fixture.test/',
      },
    ])
  })

  it('leaves out what saves under 1,400 bytes, or under 10% unless it saves 20,000', () => {
    const small = text({ url: 'http://fixture.test/a.js', size: 2_000, gzipSize: 700 })
    const dense = text({ url: 'http://fixture.test/b.json', size: 100_000, gzipSize: 95_000 })
    const huge = text({ url: 'http://fixture.test/c.js', size: 500_000, gzipSize: 475_000 })
    expect(
      detectAll(rule, renderedEvidence([facts('chromium', [small, dense, huge])])).map(
        (finding) => finding.url,
      ),
    ).toEqual(['http://fixture.test/c.js'])
  })

  it('passes a page whose text came compressed', () => {
    expect(detectAll(rule, renderedEvidence([facts('chromium', [])]))).toEqual([])
    expect(applies(rule, renderedEvidence([facts('chromium', [])]))).toBe(true)
  })

  it('applies only when some text response was checked', () => {
    expect(applies(rule, renderedEvidence([renderedFacts('chromium')]))).toBe(false)
  })
})

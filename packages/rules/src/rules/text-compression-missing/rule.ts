import type { UncompressedTextFact } from '@arablyzer/collectors'
import { renderedFacts, Sightings } from '../../lib/rendered'
import { kilobytes } from '../../lib/sizes'
import { defineRule } from '../../rule'

/**
 * Lighthouse 12's thresholds (uses-text-compression): savings under 1,400 bytes are left alone,
 * as are savings under 10% of a file unless they reach 20,000 bytes (M1.3 plan §0).
 */
const MIN_SAVINGS = 1_400
const MIN_RATIO = 0.1
const ALWAYS_SAVINGS = 20_000

function worthCompressing({ size, gzipSize }: UncompressedTextFact): boolean {
  const savings = size - gzipSize
  return savings >= MIN_SAVINGS && (savings >= ALWAYS_SAVINGS || savings / size >= MIN_RATIO)
}

/**
 * The page, or a script, stylesheet or data response it loads, sent without Content-Encoding
 * although gzip would make it much smaller: every visitor downloads the difference.
 */
export const rule = defineRule({
  id: 'text-compression-missing',
  version: '1.0.0',
  category: 'speed',
  severity: 'moderate',
  needs: ['render'],
  messages: ['uncompressed'],
  appliesTo: (_page, evidence) =>
    renderedFacts(evidence).some((facts) => facts.compression.checked > 0),
  detect: ({ rendered = [] }) => {
    const files = new Sightings<UncompressedTextFact>()
    for (const facts of rendered) {
      for (const text of facts.compression.uncompressed) {
        if (worthCompressing(text)) files.add(text.url, facts.engine, text)
      }
    }
    return [...files].flatMap(({ key, engines, each }) => {
      const text = engines[0] === undefined ? undefined : each.get(engines[0])
      if (text === undefined) return []
      const size = kilobytes(text.size)
      const gzipped = kilobytes(text.gzipSize)
      return [
        {
          message: 'uncompressed' as const,
          // The saving as the difference of the sizes shown, so the three add up.
          values: { url: key, size, gzipped, saved: Math.round((size - gzipped) * 10) / 10 },
          url: key,
          engines,
          key,
        },
      ]
    })
  },
})

import type { ImageFact } from '@arablyzer/collectors'
import { renderedFacts, Sightings } from '../../lib/rendered'
import { kilobytes } from '../../lib/sizes'
import { defineRule } from '../../rule'

/**
 * The formats Lighthouse 12 looked at (image\/((x|ms|x-ms)-)?(png|bmp|jpeg)): not GIF, which it
 * left to its audit of animated content.
 */
const LEGACY = new Map([
  ['image/jpeg', 'JPEG'],
  ['image/jpg', 'JPEG'],
  ['image/pjpeg', 'JPEG'],
  ['image/png', 'PNG'],
  ['image/x-png', 'PNG'],
  ['image/bmp', 'BMP'],
  ['image/x-bmp', 'BMP'],
  ['image/ms-bmp', 'BMP'],
  ['image/x-ms-bmp', 'BMP'],
])

/**
 * Lighthouse 12 re-encoded each image in Chrome and estimated AVIF from those sizes; when it
 * could not, it estimated from the file's pixels, at 2 bytes a pixel and 12:1. That fallback is
 * used here for every image, in every engine; and its threshold, savings of 8,192 bytes (M1.3 plan
 * §0).
 */
const AVIF_BYTES_PER_PIXEL = 2 / 12
const MIN_SAVINGS = 8_192

/** The image's estimated size as AVIF, when it is in an older format that would gain from it. */
function avifEstimate(image: ImageFact): number | null {
  if (image.type === null || image.size === null || !LEGACY.has(image.type)) return null
  const estimate = Math.round(image.naturalWidth * image.naturalHeight * AVIF_BYTES_PER_PIXEL)
  return image.size - estimate >= MIN_SAVINGS ? estimate : null
}

/**
 * Images sent as JPEG, PNG or BMP that would be much smaller as AVIF or WebP, which every
 * current browser draws.
 */
export const rule = defineRule({
  id: 'image-format-legacy',
  version: '1.0.0',
  category: 'speed',
  severity: 'minor',
  needs: ['render'],
  messages: ['legacy'],
  appliesTo: (_page, evidence) =>
    renderedFacts(evidence).some((facts) =>
      facts.images.some((image) => image.type !== null && image.size !== null),
    ),
  detect: ({ rendered = [] }) => {
    const images = new Sightings<ImageFact>()
    for (const facts of rendered) {
      for (const image of facts.images) {
        if (avifEstimate(image) !== null) images.add(image.url, facts.engine, image)
      }
    }
    return [...images].flatMap(({ key, engines, each }) => {
      const image = engines[0] === undefined ? undefined : each.get(engines[0])
      const estimate = image === undefined ? null : avifEstimate(image)
      if (image === undefined || estimate === null || image.size === null) return []
      return [
        {
          message: 'legacy' as const,
          values: {
            url: key,
            format: LEGACY.get(image.type ?? '') ?? image.type ?? '',
            size: kilobytes(image.size),
            avif: kilobytes(estimate),
          },
          selector: image.selector,
          engines,
          box: image.box,
          key,
        },
      ]
    })
  },
})

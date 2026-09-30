import type { ImageFact } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, renderedEvidence, renderedFacts } from '../../../test/helpers'
import { rule } from './rule'

// The browser suite renders the wrong and right fixtures in every engine; here the detector
// reads the images the render measured.
const image = (overrides: Partial<ImageFact> = {}): ImageFact => ({
  selector: 'html > body > main > img',
  box: { x: 20, y: 120, width: 128, height: 128 },
  url: 'http://fixture.test/images/sadu.png',
  naturalWidth: 128,
  naturalHeight: 128,
  type: 'image/png',
  size: 43_734,
  ...overrides,
})

const facts = (engine: 'chromium' | 'firefox', images: ImageFact[]) =>
  renderedFacts(engine, { images })

describe('image-format-legacy', () => {
  it('fires on a PNG far larger than its size as AVIF, once for every engine', () => {
    expect(
      detectAll(
        rule,
        renderedEvidence([facts('chromium', [image()]), facts('firefox', [image()])]),
      ),
    ).toEqual([
      {
        message: 'legacy',
        // 128 × 128 pixels at 2 bytes and 12:1: 2,731 bytes.
        values: { url: image().url, format: 'PNG', size: 42.7, avif: 2.7 },
        selector: image().selector,
        engines: ['chromium', 'firefox'],
        box: image().box,
        key: image().url,
      },
    ])
  })

  it('passes modern formats, and small savings', () => {
    const webp = image({ url: 'http://fixture.test/images/sadu.webp', type: 'image/webp' })
    const icon = image({ url: 'http://fixture.test/icon.png', size: 9_000 })
    expect(detectAll(rule, renderedEvidence([facts('chromium', [webp, icon])]))).toEqual([])
  })

  it('names JPEG as JPEG, and says nothing of an image whose size is unknown', () => {
    const photo = image({ url: 'http://fixture.test/p.jpg', type: 'image/jpeg', size: 90_000 })
    const unknown = image({ url: 'http://fixture.test/q.jpg', type: 'image/jpeg', size: null })
    expect(
      detectAll(rule, renderedEvidence([facts('chromium', [photo, unknown])])).map(
        (finding) => finding.values?.format,
      ),
    ).toEqual(['JPEG'])
  })

  it('reads BMP as Lighthouse 12 did, and leaves GIF out (M1.3a review)', () => {
    const bitmap = image({ url: 'http://fixture.test/b.bmp', type: 'image/x-ms-bmp', size: 49_206 })
    const gif = image({ url: 'http://fixture.test/g.gif', type: 'image/gif', size: 90_000 })
    expect(
      detectAll(rule, renderedEvidence([facts('chromium', [bitmap, gif])])).map(
        (finding) => finding.values?.format,
      ),
    ).toEqual(['BMP'])
  })

  it('applies when some image has a known type and size', () => {
    expect(applies(rule, renderedEvidence([facts('chromium', [image()])]))).toBe(true)
    expect(applies(rule, renderedEvidence([facts('chromium', [image({ size: null })])]))).toBe(
      false,
    )
  })
})

import type { PageFacts } from '@arablyzer/collectors'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'relative' | 'insecure' | 'unsupported'

/** The image tags a link preview reads. */
const TAGS = new Set([
  'og:image',
  'og:image:url',
  'og:image:secure_url',
  'twitter:image',
  'twitter:image:src',
])

/** Formats the sharing apps do not draw (Open Graph's image guidance and Twitter's card documentation). */
const UNSUPPORTED = /\.(?:svg|ico|avif|bmp|tiff?)(?:[?#]|$)/i

/**
 * M6.1: the image a shared link shows (`og:image`, `twitter:image`) is a full address that the
 * sharing apps can fetch and draw: not a path relative to the page, not http, and not a format they
 * skip (SVG, ICO). An empty tag is the image missing, which og-tags-missing says. Whether the image has the right size is not read: the file is
 * not fetched.
 */
export const rule = defineRule({
  id: 'og-image-invalid',
  version: '1.0.0',
  category: 'onpage',
  severity: 'moderate',
  needs: ['html'],
  messages: ['relative', 'insecure', 'unsupported'],
  appliesTo: (page) => imageMetas(page).length > 0,
  detect: ({ page }): DetectorFinding<Message>[] =>
    imageMetas(page).flatMap((meta): DetectorFinding<Message>[] => {
      const content = (meta.content ?? '').trim()
      const name = (meta.property ?? meta.name ?? '').toLowerCase()
      // An empty tag is og-tags-missing's: the image is missing, not wrong.
      if (content === '') return []
      const message: Message | null = !/^[a-z][a-z0-9+.-]*:/i.test(content)
        ? 'relative'
        : /^http:/i.test(content)
          ? 'insecure'
          : UNSUPPORTED.test(content)
            ? 'unsupported'
            : null
      if (message === null) return []
      return [
        {
          message,
          values: { tag: name, image: content.slice(0, 120) },
          selector: meta.selector,
          ...(meta.snippet === null ? {} : { snippet: meta.snippet }),
          ...(meta.location === null ? {} : { location: meta.location }),
          key: `${name}:${content}`,
        },
      ]
    }),
})

function imageMetas(page: PageFacts) {
  return (page.html?.metas ?? []).filter((meta) =>
    TAGS.has((meta.property ?? meta.name ?? '').trim().toLowerCase()),
  )
}

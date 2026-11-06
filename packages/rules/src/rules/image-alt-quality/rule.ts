import type { TextAlternative } from '@arablyzer/collectors'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'filename' | 'generic' | 'prefix'

/** A name a camera, a phone or an export gave the file: IMG_2045.jpg, DSC00012, Screenshot 2026-03-05, photo-1.png. */
const FILENAME =
  /\.(?:jpe?g|png|gif|webp|avif|svg|bmp|tiff?)\s*$|^(?:img|image|dsc|dscn|pic|photo|screenshot|screen shot|scan|untitled)[\s_-]*\d+\b/iu
/** A word that names the kind of thing and nothing else. */
const GENERIC =
  /^(?:image|img|photo|picture|pic|graphic|banner|logo|icon|صورة|صوره|الصورة|صور|لقطة|شعار|أيقونة|ايقونة)$/iu
/** "Image of …" and «صورة لـ …»: a screen reader already says it is an image. */
const PREFIX = /^(?:image|picture|photo|graphic) of\s+\S|^(?:صورة|صوره|لقطة)\s+(?:ل|لـ|عن)\s*\S/iu

function kindOf(text: string): Message | null {
  const alt = text.trim()
  if (FILENAME.test(alt)) return 'filename'
  if (GENERIC.test(alt)) return 'generic'
  if (PREFIX.test(alt)) return 'prefix'
  return null
}

/**
 * M10.2: images whose alternative text is not a description: a file's name (`IMG_2045.jpg`), a
 * word that only names the kind (`image`, «صورة»), or a description that begins by saying it is a
 * picture («صورة لـ…», "image of…"). A screen reader reads the alt text instead of the image, and a
 * search engine uses it to understand the image. A missing `alt` is the accessibility checks'.
 * One finding for each kind, with how many and the first.
 */
export const rule = defineRule({
  id: 'image-alt-quality',
  version: '1.0.0',
  category: 'trust',
  severity: 'minor',
  needs: ['html'],
  messages: ['filename', 'generic', 'prefix'],
  appliesTo: (page) => (page.html?.textAlternatives ?? []).some((entry) => entry.source === 'alt'),
  detect: ({ page }): DetectorFinding<Message>[] => {
    const groups = new Map<Message, { count: number; first: TextAlternative }>()
    for (const entry of page.html?.textAlternatives ?? []) {
      if (entry.source !== 'alt') continue
      const kind = kindOf(entry.text)
      if (kind === null) continue
      const known = groups.get(kind)
      if (known === undefined) groups.set(kind, { count: 1, first: entry })
      else known.count++
    }
    return (['filename', 'generic', 'prefix'] as const).flatMap((message) => {
      const group = groups.get(message)
      if (group === undefined) return []
      const { first } = group
      return [
        {
          message,
          values: { count: group.count, alt: first.text },
          selector: first.selector,
          ...(first.snippet === null ? {} : { snippet: first.snippet }),
          ...(first.location === null ? {} : { location: first.location }),
          key: message,
        },
      ]
    })
  },
})

import { defineRule, type DetectorFinding } from '../../rule'

/** The Open Graph tags a link preview is made of. */
const TAGS = [
  { tag: 'og:title', message: 'title' },
  { tag: 'og:description', message: 'description' },
  { tag: 'og:image', message: 'image' },
] as const

type Message = (typeof TAGS)[number]['message']

export const rule = defineRule({
  id: 'og-tags-missing',
  version: '1.0.0',
  category: 'onpage',
  severity: 'minor',
  needs: ['html'],
  messages: TAGS.map(({ message }) => message),
  appliesTo: (page) => page.html !== null,
  detect: ({ page }) => {
    const metas = page.html?.metas ?? []
    const findings: DetectorFinding<Message>[] = []
    for (const { tag, message } of TAGS) {
      // Open Graph uses property=; some pages write name=, which apps read as well.
      const tagged = metas.filter(
        (meta) => meta.property?.trim().toLowerCase() === tag || meta.name === tag,
      )
      if (tagged.some((meta) => (meta.content?.trim() ?? '') !== '')) continue
      const [first] = tagged
      findings.push({
        message,
        values: { tag },
        selector: first?.selector ?? 'head',
        ...(first?.snippet == null ? {} : { snippet: first.snippet }),
        ...(first?.location == null ? {} : { location: first.location }),
        key: tag,
      })
    }
    return findings
  },
})

import { defineRule } from '../../rule'

/** The viewport's properties, as browsers read them: `key=value` separated by commas, semicolons or spaces. */
function viewportProperties(content: string): Map<string, string> {
  const properties = new Map<string, string>()
  // The lookbehind starts a match where the spaces start, so long runs of spaces stay linear.
  const normalized = content.toLowerCase().replace(/(?<!\s)\s*=\s*/g, '=')
  for (const part of normalized.split(/[\s,;]+/)) {
    const [key, value] = part.split('=')
    if (key !== undefined && key !== '' && value !== undefined) properties.set(key, value)
  }
  return properties
}

export const rule = defineRule({
  id: 'viewport-missing',
  version: '1.0.0',
  category: 'onpage',
  severity: 'serious',
  needs: ['html'],
  messages: ['missing', 'no-device-width'],
  appliesTo: (page) => page.html !== null,
  detect: ({ page }) => {
    const viewport = page.html?.metas.find((meta) => meta.name === 'viewport')
    if (viewport === undefined) return [{ message: 'missing', selector: 'head' }]
    const content = viewport.content ?? ''
    const properties = viewportProperties(content)
    const width = properties.get('width')
    // initial-scale alone also gives the device's width (as Lighthouse's viewport audit accepts).
    if (width === 'device-width' || (width === undefined && properties.has('initial-scale'))) {
      return []
    }
    return [
      {
        message: 'no-device-width',
        values: { content },
        selector: viewport.selector,
        ...(viewport.snippet === null ? {} : { snippet: viewport.snippet }),
        ...(viewport.location === null ? {} : { location: viewport.location }),
      },
    ]
  },
})

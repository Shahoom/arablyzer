import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'language' | 'format'

/**
 * M10.2: the page's `og:locale` (the language a share is shown in) against its `lang`. An Arabic
 * page whose `og:locale` is `en_US` is the common slip of a theme or an SEO plugin left on its
 * default; and Open Graph writes a locale with an underscore (`ar_SA`), not a hyphen.
 */
export const rule = defineRule({
  id: 'og-locale-mismatch',
  version: '1.0.0',
  category: 'intl',
  severity: 'minor',
  needs: ['html'],
  messages: ['language', 'format'],
  appliesTo: (page) =>
    page.html !== null &&
    (page.html.root.lang?.trim() ?? '') !== '' &&
    page.html.metas.some(
      (meta) => meta.property === 'og:locale' && (meta.content ?? '').trim() !== '',
    ),
  detect: ({ page }): DetectorFinding<Message>[] => {
    const html = page.html
    if (html === null) return []
    const lang = html.root.lang?.trim() ?? ''
    const meta = html.metas.find((entry) => entry.property === 'og:locale')
    const locale = meta?.content?.trim() ?? ''
    if (meta === undefined || locale === '') return []
    const findings: DetectorFinding<Message>[] = []
    const base = (code: string) => (code.split(/[-_]/)[0] ?? '').toLowerCase()
    const at = {
      selector: meta.selector,
      ...(meta.snippet === null ? {} : { snippet: meta.snippet }),
    }
    if (base(locale) !== base(lang)) {
      findings.push({ message: 'language', values: { locale, lang }, ...at })
    }
    if (locale.includes('-')) {
      findings.push({
        message: 'format',
        values: { locale, suggestion: locale.replaceAll('-', '_') },
        ...at,
      })
    }
    return findings
  },
})

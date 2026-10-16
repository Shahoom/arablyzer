import { alternates, selfEntry } from '../../lib/hreflang-set'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'language-differs' | 'region-differs'

/** The language and the region of a tag, lowercase and uppercase: «ar-SA» gives ar and SA. */
function partsOf(tag: string): { language: string; region: string | null } {
  const [language = '', ...rest] = tag.trim().replaceAll('_', '-').split('-')
  const region = rest.find((part) => /^(?:[A-Za-z]{2}|\d{3})$/.test(part))
  return { language: language.toLowerCase(), region: region?.toUpperCase() ?? null }
}

/**
 * M6.1: the page lists itself with one language, and its `<html lang>` says another («ar-SA» in
 * the list and `lang="en"` on the page), or the same language for another country («ar-AE» and
 * «ar-SA»). Search engines and browsers get two answers for one page. The page's own entry is
 * found by its canonical address, and not judged when it cannot be told.
 */
export const rule = defineRule({
  id: 'hreflang-lang-mismatch',
  version: '1.0.0',
  category: 'intl',
  severity: 'moderate',
  needs: ['html'],
  messages: ['language-differs', 'region-differs'],
  appliesTo: (page) => {
    const self = selfEntry(page, alternates(page))
    return self !== null && self !== 'unknown' && (page.html?.root.lang ?? '').trim() !== ''
  },
  detect: ({ page }): DetectorFinding<Message>[] => {
    const self = selfEntry(page, alternates(page))
    const lang = page.html?.root.lang?.trim() ?? ''
    if (self === null || self === 'unknown' || lang === '') return []
    const listed = partsOf(self.code)
    const declared = partsOf(lang)
    const message: Message | null =
      listed.language !== declared.language
        ? 'language-differs'
        : listed.region !== null && declared.region !== null && listed.region !== declared.region
          ? 'region-differs'
          : null
    if (message === null) return []
    return [
      {
        message,
        values: { hreflang: self.code, lang },
        selector: self.link.selector,
        ...(self.link.snippet === null ? {} : { snippet: self.link.snippet }),
        ...(self.link.location === null ? {} : { location: self.link.location }),
        key: `${self.code}:${lang}`,
      },
    ]
  },
})

/** Where Arablyzer is, unless the person says otherwise. */
export const DEFAULT_ORIGIN = 'https://arablyzer.com'

export type SiteLang = 'ar' | 'en'

const prefix = (lang: SiteLang) => (lang === 'ar' ? '' : '/en')

/** A rule's page on the site (`/rules/<id>`, under `/en` in English): what the finding means and how to fix it. */
export function rulePageUrl(origin: string, lang: SiteLang, ruleId: string): string {
  return `${origin.replace(/\/+$/, '')}${prefix(lang)}/rules/${encodeURIComponent(ruleId)}`
}

/** The site's own scan form, with the address filled in: where a person without a key is sent. */
export function scanFormUrl(origin: string, lang: SiteLang, pageUrl: string): string {
  return `${origin.replace(/\/+$/, '')}${lang === 'ar' ? '/' : '/en/'}?url=${encodeURIComponent(pageUrl)}`
}

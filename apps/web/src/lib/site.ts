import type { SiteStrings } from '@arablyzer/i18n'
import { defineSite, localePath, PATHS, type Lang, type Site } from '@arablyzer/seo/site'

/** The site the pages are built for, from astro.config.ts's `site`. */
export function siteOf(origin: URL | undefined): Site {
  if (origin === undefined) throw new Error('astro.config.ts sets `site`')
  return defineSite(origin.origin)
}

export const LANGS: readonly Lang[] = ['ar', 'en']

export function dirOf(lang: Lang): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr'
}

export function otherLang(lang: Lang): Lang {
  return lang === 'ar' ? 'en' : 'ar'
}

/**
 * The site's repository, for the code and the methodology. It is private until the owner opens
 * it, which must come before the site is public: the page says the code is open (M2.1 plan).
 */
export const REPOSITORY = 'https://github.com/Shahoom/arablyzer'

/** The methodology, Arabic first, in the repository (docs/methodology.md). */
export const METHODOLOGY = `${REPOSITORY}/blob/main/docs/methodology.md`

export const CLOUDTOPIA = 'https://cloudtopia.net'

/**
 * Pages the header lists, in order, as they are built (M2.2 to M2.4). A link to a page that does
 * not exist fails the self-audit, so each comes with its page. `key` names its label in SITE.nav.
 */
export const NAV: readonly { readonly key: keyof SiteStrings['nav']; readonly path: string }[] = [
  { key: 'tools', path: PATHS.tools },
]

/** The home page's scan form, which the header's call to action goes to. */
export function scanFormHref(lang: Lang): string {
  return `${localePath(lang, PATHS.home)}#scan`
}

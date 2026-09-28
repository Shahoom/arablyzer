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

/** The site's repository, for the code and the methodology. */
export const REPOSITORY = 'https://github.com/Shahoom/arablyzer'

export const CLOUDTOPIA = 'https://cloudtopia.net'

/**
 * Pages the header lists, in order, as they are built (M2.2 to M2.4). A link to a page that does
 * not exist fails the self-audit, so each comes with its page.
 */
export const NAV: readonly { readonly key: string; readonly path: string }[] = []

/** The home page's scan form, which the header's call to action goes to. */
export function scanFormHref(lang: Lang): string {
  return `${localePath(lang, PATHS.home)}#scan`
}

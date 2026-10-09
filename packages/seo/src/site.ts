export type Lang = 'ar' | 'en'

export interface Site {
  /** https://host, without a path or a trailing slash. */
  readonly origin: string
}

/** Validated once, so every URL built from it is absolute and https. */
export function defineSite(origin: string): Site {
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    throw new TypeError(`Not a site origin: ${origin}`)
  }
  if (url.protocol !== 'https:' || url.origin !== origin || url.username !== '') {
    throw new TypeError(`A site origin is https://host without a path: ${origin}`)
  }
  return Object.freeze({ origin })
}

/**
 * The domain is the owner's decision (BUILD-PLAN §20.1). Until then pages are rendered, for
 * tests and the self-audit only, for a reserved example domain (RFC 2606).
 */
export const PREVIEW_SITE: Site = defineSite('https://arablyzer.example')

/** Paths of the Arabic pages; localePath() gives the English ones (BUILD-PLAN §1, §5.1). */
export const PATHS = {
  home: '/',
  tools: '/tools',
  tool: (slug: string) => `/tools/${slug}`,
  knowledge: '/knowledge',
  rules: '/rules',
  methodology: '/methodology',
  bot: '/bot',
  login: '/login',
  account: '/account',
  compare: '/account/compare',
  fix: '/fix',
  fixGuide: (slug: string) => `/fix/${slug}`,
  glossary: '/glossary',
  term: (slug: string) => `/glossary/${slug}`,
  rule: (id: string) => `/rules/${id}`,
} as const

/** Arabic at the root, English under /en. */
export function localePath(lang: Lang, path: string): string {
  if (!path.startsWith('/')) throw new TypeError(`A path starts with "/": ${path}`)
  if (lang === 'ar') return path
  return path === '/' ? '/en/' : `/en${path}`
}

export function pageUrl(site: Site, lang: Lang, path: string): string {
  return `${site.origin}${localePath(lang, path)}`
}

export interface Alternate {
  readonly hreflang: 'ar' | 'en' | 'x-default'
  readonly href: string
}

/** hreflang for a page in both languages; x-default is the Arabic page (BUILD-PLAN §6.5). */
export function alternates(site: Site, path: string): Alternate[] {
  const ar = pageUrl(site, 'ar', path)
  return [
    { hreflang: 'ar', href: ar },
    { hreflang: 'en', href: pageUrl(site, 'en', path) },
    { hreflang: 'x-default', href: ar },
  ]
}

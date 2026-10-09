// Addresses in a crawl (M4.5): which are the same page, which are not pages, and which kind of
// page an address looks like. Pure; the crawl's politeness and robots.txt are the scanner's.

/** The query variants of one path a crawl keeps: a calendar or a filter list is not a thousand pages. */
export const MAX_QUERY_VARIANTS = 3
/** Query parameters that say where a visitor came from and not which page it is. */
const TRACKING =
  /^(?:utm_.*|fbclid|gclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igshid|yclid|_ga|ref|ref_src)$/i
/** Files that are not pages (the engine skips them in links; sitemaps may list them). */
const NOT_PAGES =
  /\.(?:pdf|zip|gz|rar|7z|jpe?g|png|gif|webp|avif|svg|ico|bmp|mp[34]|webm|mov|avi|wav|ogg|css|js|mjs|json|xml|txt|csv|xlsx?|docx?|pptx?|woff2?|ttf|otf|eot|apk|dmg|exe)$/i

/**
 * An address as the crawl keeps it, or null when it is not a page of `origin`: same origin, no
 * fragment, no tracking parameters, the other parameters in order, no doubled slashes. Two
 * addresses that differ only in these are one page.
 */
export function normalizeUrl(href: string, origin: string): string | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  if (url.origin !== origin || url.username !== '' || url.password !== '') return null
  if (NOT_PAGES.test(url.pathname)) return null
  url.hash = ''
  url.pathname = url.pathname.replace(/\/{2,}/g, '/')
  const kept = [...url.searchParams.entries()]
    .filter(([name]) => !TRACKING.test(name))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  url.search = ''
  for (const [name, value] of kept) url.searchParams.append(name, value)
  return url.href
}

/** The path of an address without its query, as segments. */
export function segmentsOf(href: string): string[] {
  try {
    return new URL(href).pathname.split('/').filter((segment) => segment !== '')
  } catch {
    return []
  }
}

const decode = (segment: string): string => {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/**
 * What a path segment stands for: a number, an id, a date, a slug, or itself. A slug is a long
 * segment, or one with two hyphens or underscores in it (one, in Arabic: a title of several words); a short plain word stays itself, because `products` and `blog`
 * (or `منتجات`) name a kind of page.
 */
export function shapeOf(segment: string): string {
  const text = decode(segment)
  if (/^\d+$/.test(text)) return ':num'
  if (/^\d{4}[-_]\d{2}(?:[-_]\d{2})?$/.test(text)) return ':date'
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return ':id'
  if (/^(?=.*\d)[0-9a-f]{8,}$/i.test(text)) return ':id'
  // An Arabic title in an address is several words joined by hyphens; one Arabic word is a section.
  const arabic = /[^ -~]/.test(text)
  if (/[-_].*[-_]/.test(text) || (arabic && /[-_]/.test(text))) return ':slug'
  if (text.length > (arabic ? 14 : 24)) return ':slug'
  return text.toLowerCase()
}

/**
 * The rough kind of an address, for taking pages in turn: its shaped segments, the last one
 * standing for any page of its kind. `/products/nike-air-max-90` and `/products/12` are
 * `/products/:leaf`; `/about` and `/contact` are `/:leaf`; the home page is `/`.
 */
export function bucketOf(href: string): string {
  const shaped = segmentsOf(href).map(shapeOf)
  if (shaped.length === 0) return '/'
  shaped[shaped.length - 1] = ':leaf'
  return `/${shaped.join('/')}`
}

/** A path's key for counting query variants: the address without its query. */
export function pathKey(href: string): string {
  try {
    const url = new URL(href)
    return `${url.origin}${url.pathname}`
  } catch {
    return href
  }
}

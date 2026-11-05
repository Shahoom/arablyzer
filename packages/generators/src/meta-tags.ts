import { escapeHtml } from './html'

// The meta tag generator and the search result preview (M10.1): the head of a page, written from its
// title, description and address, with the tags the page-checks read; and how a result looks.

export interface MetaInput {
  readonly lang: 'ar' | 'en'
  readonly title: string
  readonly description: string
  /** The page's address; its canonical. */
  readonly url: string
  readonly siteName: string
  readonly image: string
  readonly noindex: boolean
  readonly article: boolean
}

export type MetaProblem = 'title-blank' | 'url-bad' | 'image-bad'

export interface MetaResult {
  /** The opening tag of the page, with its language and direction. */
  readonly htmlTag: string
  readonly head: string
  readonly problems: readonly MetaProblem[]
  readonly titleLength: number
  readonly descriptionLength: number
}

function absolute(value: string): string | null {
  try {
    const url = new URL(value.trim())
    return /^https?:$/.test(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

export function metaTags(input: MetaInput): MetaResult {
  const problems: MetaProblem[] = []
  const title = input.title.replace(/\s+/g, ' ').trim()
  const description = input.description.replace(/\s+/g, ' ').trim()
  if (title === '') problems.push('title-blank')
  const url = input.url.trim() === '' ? null : absolute(input.url)
  if (input.url.trim() !== '' && url === null) problems.push('url-bad')
  const image = input.image.trim() === '' ? null : absolute(input.image)
  if (input.image.trim() !== '' && image === null) problems.push('image-bad')
  const e = escapeHtml
  const lines = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${e(title)}</title>`,
    ...(description === '' ? [] : [`<meta name="description" content="${e(description)}">`]),
    ...(url === null ? [] : [`<link rel="canonical" href="${e(url)}">`]),
    ...(input.noindex ? ['<meta name="robots" content="noindex, follow">'] : []),
    `<meta property="og:type" content="${input.article ? 'article' : 'website'}">`,
    `<meta property="og:locale" content="${input.lang === 'ar' ? 'ar_AR' : 'en_US'}">`,
    `<meta property="og:title" content="${e(title)}">`,
    ...(description === '' ? [] : [`<meta property="og:description" content="${e(description)}">`]),
    ...(url === null ? [] : [`<meta property="og:url" content="${e(url)}">`]),
    ...(image === null ? [] : [`<meta property="og:image" content="${e(image)}">`]),
    ...(input.siteName.trim() === ''
      ? []
      : [`<meta property="og:site_name" content="${e(input.siteName.trim())}">`]),
    `<meta name="twitter:card" content="${image === null ? 'summary' : 'summary_large_image'}">`,
  ]
  return {
    htmlTag: input.lang === 'ar' ? '<html lang="ar" dir="rtl">' : '<html lang="en" dir="ltr">',
    head: lines.join('\n'),
    problems,
    titleLength: Array.from(title).length,
    descriptionLength: Array.from(description).length,
  }
}

/** Search tools' convention, not Google's number: Google cuts a title by its width and may rewrite it. */
export const TITLE_WIDTH = 600
export const DESCRIPTION_CHARACTERS = 160

export interface SerpPreview {
  readonly title: string
  readonly titleCut: boolean
  readonly description: string
  readonly descriptionCut: boolean
  /** The address as a result shows it: the host, then the path's parts after a ›. */
  readonly crumbs: string
}

/** `measure` gives a text's width in pixels at the title's size; the browser's canvas gives it. */
export function serpPreview(
  title: string,
  description: string,
  url: string,
  measure: (text: string) => number,
): SerpPreview {
  const clean = (text: string) => text.replace(/\s+/g, ' ').trim()
  const letters = Array.from(clean(title))
  let titleText = letters.join('')
  let titleCut = false
  if (measure(titleText) > TITLE_WIDTH) {
    titleCut = true
    let end = letters.length
    while (end > 1 && measure(`${letters.slice(0, end).join('')}…`) > TITLE_WIDTH) end--
    titleText = `${letters.slice(0, end).join('').trimEnd()}…`
  }
  const words = Array.from(clean(description))
  const descriptionCut = words.length > DESCRIPTION_CHARACTERS
  const descriptionText = descriptionCut
    ? `${words.slice(0, DESCRIPTION_CHARACTERS).join('').trimEnd()}…`
    : words.join('')
  let crumbs = url.trim()
  try {
    const parsed = new URL(url.trim())
    const parts = parsed.pathname
      .split('/')
      .filter((part) => part !== '')
      .map((part) => {
        try {
          return decodeURIComponent(part)
        } catch {
          return part
        }
      })
    crumbs = [parsed.origin, ...parts].join(' › ')
  } catch {
    // Shown as typed.
  }
  return { title: titleText, titleCut, description: descriptionText, descriptionCut, crumbs }
}

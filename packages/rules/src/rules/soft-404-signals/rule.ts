import { defineRule, type DetectorFinding } from '../../rule'

/** Visible letters a page may have and still be taken for an error page (our figure). */
export const SOFT_404_MAX_LETTERS = 2000

/**
 * What an error page says of itself, in Arabic and English: the page, the address or the content
 * "not found", "does not exist", a 404. Matched on whole words: «غير موجود» is not «موجودة».
 */
const NOT_FOUND =
  /(?<!\p{L})(?:الصفحة|صفحة|المحتوى|الرابط)(?:\s+المطلوبة?)?\s+(?:غير\s+موجود[ةه]?|لا\s+(?:توجد|يوجد)|لم\s+(?:يتم\s+)?(?:العثور|نعثر|نجد))|لم\s+(?:يتم\s+)?(?:العثور\s+على|نعثر\s+على|نجد)\s+(?:الصفحة|هذه\s+الصفحة|ما\s+تبحث)|(?:خطأ|error)\s*[:\-–]?\s*(?:404|٤٠٤)|(?<![\p{L}\p{N}.])(?:404|٤٠٤)(?![\p{L}\p{N}.,])|\bpage\s+(?:was\s+)?not\s+found\b|\b(?:page|url)\s+(?:does\s+not|doesn['’]t)\s+exist\b|\bnothing\s+(?:was\s+)?found\b|\b(?:we|i)\s+(?:could\s+not|couldn['’]t|can['’]t|cannot)\s+find\b/iu

/**
 * M6.1: a "not found" page that answers 200. Google calls it a soft 404: the page says it does
 * not exist, the server says it does, and the address stays in the index. A page that says so in
 * its title or its first heading, with little else on it, answered 2xx. A server that answers
 * 404 or 410 is right and passes; a page of any other status is not judged. The page you give is
 * the page judged: to test a site's missing-page handling, give an address that does not exist.
 */
export const rule = defineRule({
  id: 'soft-404-signals',
  version: '1.0.0',
  category: 'crawl',
  severity: 'serious',
  needs: ['response'],
  messages: ['soft-404'],
  appliesTo: (page) =>
    page.html !== null &&
    ((page.status >= 200 && page.status <= 299) || [404, 410].includes(page.status)),
  detect: ({ page }): DetectorFinding<'soft-404'>[] => {
    const html = page.html
    if (html === null || page.status < 200 || page.status > 299) return []
    const heading = html.headings.find((candidate) => candidate.level === 1) ?? html.headings[0]
    const sources: readonly [string, string | null][] = [
      ['title', html.title],
      ['heading', heading?.text ?? null],
    ]
    const hit = sources.find(([, text]) => text !== null && NOT_FOUND.test(text))
    if (hit === undefined) return []
    // An article about error pages is long; an error page is not.
    if ((page.text?.letters.total ?? 0) > SOFT_404_MAX_LETTERS) return []
    const [source, text] = hit
    return [
      {
        message: 'soft-404',
        values: { status: page.status, source, text: (text ?? '').slice(0, 120) },
        ...(source === 'title'
          ? html.titleElement === null
            ? {}
            : {
                selector: html.titleElement.selector,
                ...(html.titleElement.snippet === null
                  ? {}
                  : { snippet: html.titleElement.snippet }),
                ...(html.titleElement.location === null
                  ? {}
                  : { location: html.titleElement.location }),
              }
          : heading === undefined
            ? {}
            : {
                selector: heading.selector,
                ...(heading.snippet === null ? {} : { snippet: heading.snippet }),
                ...(heading.location === null ? {} : { location: heading.location }),
              }),
        key: source,
      },
    ]
  },
})

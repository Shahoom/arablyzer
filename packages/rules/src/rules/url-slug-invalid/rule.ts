import type { PageFacts } from '@arablyzer/collectors'
import { slugProblems, type SlugProblem } from '../../lib/url-slug'
import { defineRule, type DetectorFinding } from '../../rule'

type Where = 'address' | 'canonical'

interface Carrier {
  readonly where: Where
  readonly url: string
  readonly path: string
}

function carrier(where: Where, url: string | null): Carrier | null {
  if (url === null) return null
  try {
    const parsed = new URL(url)
    return /^https?:$/.test(parsed.protocol) ? { where, url, path: parsed.pathname } : null
  } catch {
    return null
  }
}

/** The page's address and the canonical it names; a canonical on the same path is not said twice. */
function carriers(page: PageFacts): Carrier[] {
  const own = carrier('address', page.url)
  const canonical = carrier(
    'canonical',
    page.html?.links.find((link) => link.rel.includes('canonical'))?.url ?? null,
  )
  return [own, canonical !== null && canonical.path !== own?.path ? canonical : null].filter(
    (found): found is Carrier => found !== null,
  )
}

/**
 * M10.1 (issue #27): the slugs of the page's address and its canonical. A slug spelled with
 * harakat or tatweel, with Eastern Arabic digits, with an underscore, a space, a capital letter,
 * a double hyphen or punctuation, or one over 100 characters, is an address people and crawlers
 * will write another way. A clean Arabic slug, percent-encoded or not, passes: Google reads UTF-8
 * addresses. One finding for each problem and place, with the first segment that has it.
 */
export const rule = defineRule({
  id: 'url-slug-invalid',
  version: '1.0.0',
  category: 'crawl',
  severity: 'minor',
  needs: ['html'],
  messages: ['marks', 'digits', 'separators', 'long'],
  appliesTo: (page) => page.html !== null && carriers(page).some(({ path }) => path !== '/'),
  detect: ({ page }): DetectorFinding<SlugProblem>[] =>
    carriers(page).flatMap(({ where, url, path }) =>
      slugProblems(path).map(({ problem, slug }) => ({
        message: problem,
        values: { slug, url },
        key: `${where}:${problem}`,
      })),
    ),
})

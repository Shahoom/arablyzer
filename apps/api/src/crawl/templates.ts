import { skeletonSimilarity } from '@arablyzer/collectors'
import type { TemplateKind } from '@arablyzer/api-contract'
import type { CrawlPageRow, StoredTemplate } from '@arablyzer/store'
import { segmentsOf, shapeOf } from './url'

// Grouping a crawl's pages into templates (M4.5): by the shape of the address first, then by the
// skeleton of the page. Deterministic: the same pages give the same templates and the same keys.

/** A node with this many children, mostly leaves, is a list of pages of one kind. */
export const COLLAPSE_AT = 5
const LEAF_SHARE = 0.6
/** Pages whose skeletons are this alike (Jaccard) are one template. */
export const SIMILAR = 0.8
/** A pattern with fewer pages than this is not a template of its own. */
export const MIN_TEMPLATE_PAGES = 2

const WORDS: readonly (readonly [TemplateKind, ReadonlySet<string>])[] = [
  [
    'product',
    new Set([
      'product',
      'products',
      'item',
      'items',
      'shop',
      'store',
      'p',
      'منتج',
      'منتجات',
      'المنتجات',
      'متجر',
      'المتجر',
    ]),
  ],
  [
    'article',
    new Set([
      'blog',
      'news',
      'article',
      'articles',
      'post',
      'posts',
      'story',
      'stories',
      'magazine',
      'مدونة',
      'المدونة',
      'مقال',
      'مقالات',
      'المقالات',
      'اخبار',
      'أخبار',
      'الاخبار',
      'الأخبار',
    ]),
  ],
  [
    'category',
    new Set([
      'category',
      'categories',
      'collection',
      'collections',
      'tag',
      'tags',
      'c',
      'cat',
      'تصنيف',
      'تصنيفات',
      'التصنيفات',
      'قسم',
      'أقسام',
      'الأقسام',
      'اقسام',
    ]),
  ],
  [
    'help',
    new Set([
      'help',
      'faq',
      'support',
      'docs',
      'guide',
      'guides',
      'مساعدة',
      'المساعدة',
      'دعم',
      'الدعم',
      'دليل',
    ]),
  ],
]

/** What an address pattern is for, from the words in it; `generic` when none says. */
export function kindOf(pattern: string): TemplateKind {
  if (pattern === '/') return 'home'
  const words = pattern
    .split('/')
    .filter((part) => part !== '' && !part.startsWith(':'))
    .map((part) => part.toLowerCase())
  for (const [kind, set] of WORDS) if (words.some((word) => set.has(word))) return kind
  return 'generic'
}

interface Counts {
  readonly children: Map<string, Set<string>>
  /** Prefixes that some address goes through, not just ends at. */
  readonly inner: Set<string>
}

const key = (segments: readonly string[], length: number): string =>
  segments.slice(0, length).join('/')

/** The prefixes whose children are a list of pages of one kind. */
function collapsedPrefixes(paths: readonly (readonly string[])[]): Set<string> {
  const counts: Counts = { children: new Map(), inner: new Set() }
  for (const segments of paths) {
    for (let depth = 0; depth < segments.length; depth++) {
      const parent = key(segments, depth)
      const set = counts.children.get(parent) ?? new Set<string>()
      set.add(segments[depth] ?? '')
      counts.children.set(parent, set)
      if (depth < segments.length - 1) counts.inner.add(key(segments, depth + 1))
    }
  }
  const collapsed = new Set<string>()
  for (const [parent, set] of counts.children) {
    if (set.size < COLLAPSE_AT) continue
    let leaves = 0
    for (const child of set) {
      if (!counts.inner.has(parent === '' ? child : `${parent}/${child}`)) leaves++
    }
    if (leaves / set.size >= LEAF_SHARE) collapsed.add(parent)
  }
  return collapsed
}

/** The address pattern of each address: `/products/:slug`, `/blog/:slug`, `/`. */
export function patternsOf(urls: readonly string[]): Map<string, string> {
  const paths = urls.map((url) => segmentsOf(url).map((segment) => shapeOf(segment)))
  const collapsed = collapsedPrefixes(paths)
  const patterns = new Map<string, string>()
  urls.forEach((url, index) => {
    const segments = paths[index] ?? []
    const out: string[] = []
    for (let depth = 0; depth < segments.length; depth++) {
      const segment = segments[depth] ?? ''
      out.push(collapsed.has(key(segments, depth)) && !segment.startsWith(':') ? ':slug' : segment)
    }
    patterns.set(url, out.length === 0 ? '/' : `/${out.join('/')}`)
  })
  return patterns
}

export interface GroupingOptions {
  /** Pages scanned in the browsers for each template. */
  readonly representatives: number
  /** The templates that get any, largest first. */
  readonly rendered: number
}

export interface Grouping {
  readonly templates: StoredTemplate[]
  readonly assignments: Map<string, string>
}

interface Cluster {
  readonly skeleton: string
  readonly rows: CrawlPageRow[]
}

/** Clusters a pattern's checked pages by skeleton; small clusters fold into the closest big one. */
function clusters(rows: readonly CrawlPageRow[]): Cluster[] {
  const made: Cluster[] = []
  for (const row of rows) {
    if (row.state !== 'checked' || row.skeleton === null) continue
    const home = made.find(
      (cluster) => skeletonSimilarity(cluster.skeleton, row.skeleton ?? '') >= SIMILAR,
    )
    if (home === undefined) made.push({ skeleton: row.skeleton, rows: [row] })
    else home.rows.push(row)
  }
  if (made.length <= 1) return made
  const total = made.reduce((sum, cluster) => sum + cluster.rows.length, 0)
  const small = Math.max(MIN_TEMPLATE_PAGES, Math.ceil(total * 0.1))
  const big = made.filter((cluster) => cluster.rows.length >= small)
  const keep =
    big.length === 0 ? [made.reduce((a, b) => (b.rows.length > a.rows.length ? b : a))] : big
  for (const cluster of made) {
    if (keep.includes(cluster)) continue
    let closest = keep[0]
    let best = -1
    for (const candidate of keep) {
      const similarity = skeletonSimilarity(candidate.skeleton, cluster.skeleton)
      if (similarity > best) {
        best = similarity
        closest = candidate
      }
    }
    closest?.rows.push(...cluster.rows)
  }
  return keep.sort((a, b) => b.rows.length - a.rows.length)
}

const STANDALONE = '*'

/**
 * Groups the pages of a crawl into templates. The home page is a template of its own; a pattern
 * of one page is not, and its page is a "standalone page"; a pattern whose pages are built in two
 * different ways is two templates. A found page that was not checked belongs to the template its
 * address pattern (and the pattern's main skeleton) says.
 */
export function groupTemplates(rows: readonly CrawlPageRow[], options: GroupingOptions): Grouping {
  const patterns = patternsOf(rows.map((row) => row.url))
  const byPattern = new Map<string, CrawlPageRow[]>()
  for (const row of rows) {
    const pattern = patterns.get(row.url) ?? '/'
    const list = byPattern.get(pattern) ?? []
    list.push(row)
    byPattern.set(pattern, list)
  }
  // Small patterns are pooled, the home page apart.
  const standalone: CrawlPageRow[] = []
  for (const [pattern, list] of [...byPattern]) {
    if (pattern !== '/' && list.length < MIN_TEMPLATE_PAGES) {
      standalone.push(...list)
      byPattern.delete(pattern)
    }
  }
  if (standalone.length > 0) byPattern.set(STANDALONE, standalone)

  interface Draft {
    readonly pattern: string
    readonly rows: CrawlPageRow[]
    readonly main: Cluster | null
  }
  const drafts: Draft[] = []
  for (const [pattern, list] of byPattern) {
    const parts = pattern === STANDALONE ? [] : clusters(list)
    if (parts.length <= 1) {
      drafts.push({ pattern, rows: list, main: parts[0] ?? null })
      continue
    }
    const placed = new Set<CrawlPageRow>()
    for (const part of parts) {
      for (const row of part.rows) placed.add(row)
      drafts.push({ pattern, rows: [...part.rows], main: part })
    }
    // Found pages with no skeleton go with the biggest variant.
    const first = drafts[drafts.length - parts.length]
    for (const row of list) if (!placed.has(row)) first?.rows.push(row)
  }

  drafts.sort(
    (a, b) =>
      Number(b.pattern === '/') - Number(a.pattern === '/') ||
      b.rows.length - a.rows.length ||
      (a.pattern < b.pattern ? -1 : a.pattern > b.pattern ? 1 : 0),
  )

  const templates: StoredTemplate[] = []
  const assignments = new Map<string, string>()
  const seen = new Map<string, number>()
  let rendered = 0
  drafts.forEach((draft, index) => {
    const templateKey = `t${String(index + 1)}`
    const variant = (seen.get(draft.pattern) ?? 0) + 1
    seen.set(draft.pattern, variant)
    const variants = drafts.filter((other) => other.pattern === draft.pattern).length
    const checked = draft.rows.filter((row) => row.state === 'checked')
    for (const row of draft.rows) assignments.set(row.url, templateKey)
    // The representatives: the shallowest pages that are built like the template's main skeleton.
    const dominant = checked.filter((row) => draft.main === null || draft.main.rows.includes(row))
    const pool = dominant.length > 0 ? dominant : checked
    const chosen =
      rendered < options.rendered
        ? [...pool]
            .sort((a, b) => a.depth - b.depth || (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))
            .slice(0, options.representatives)
        : []
    if (chosen.length > 0) rendered++
    const pattern =
      draft.pattern === STANDALONE
        ? draft.pattern
        : variants > 1
          ? `${draft.pattern}#${String(variant)}`
          : draft.pattern
    templates.push({
      key: templateKey,
      kind: draft.pattern === STANDALONE ? 'standalone' : kindOf(draft.pattern),
      pattern,
      found: draft.rows.length,
      checked: checked.length,
      representatives: chosen.map((row) => row.url),
    })
  })
  return { templates, assignments }
}

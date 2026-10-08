import type { PageFacts } from '@arablyzer/collectors'
import { jsonLdBlocks } from './jsonld'

/** The longest brand name asked about: a name, not a sentence. */
const MAX_BRAND = 100
const ORGANIZATION = /(?:Organization|Corporation|Store|Business|Brand)$/
/** What separates a brand from the rest of a title: «متجر الواحة | قهوة»; the first part is it. */
const TITLE_SEPARATOR = /\s+[|–—·•]\s+|\s+-\s+|\s*:\s+/

export interface Brand {
  readonly name: string
  readonly source: 'organization' | 'website' | 'og-site-name' | 'title'
}

const clean = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const name = value.replace(/\s+/g, ' ').trim()
  return name.length >= 2 && name.length <= MAX_BRAND ? name : null
}

export function typesOf(node: Record<string, unknown>): string[] {
  const type = node['@type']
  return (Array.isArray(type) ? (type as unknown[]) : [type]).filter(
    (item): item is string => typeof item === 'string',
  )
}

/** Every object of a JSON-LD value: its @graph, its arrays and its nested objects, bounded. */
export function* nodes(value: unknown, budget = { left: 500 }): Generator<Record<string, unknown>> {
  if (budget.left-- <= 0 || typeof value !== 'object' || value === null) return
  if (Array.isArray(value)) {
    for (const item of value as unknown[]) yield* nodes(item, budget)
    return
  }
  const node = value as Record<string, unknown>
  yield node
  for (const key of ['@graph', 'publisher', 'author', 'mainEntity']) yield* nodes(node[key], budget)
}

/**
 * The name of the site's brand: the Organization's (or a store's, business's) name in the page's
 * JSON-LD, else the WebSite's, else `og:site_name`, else the first part of the title. Null when
 * the page gives none.
 */
export function brandName(page: PageFacts): Brand | null {
  let website: string | null = null
  for (const block of jsonLdBlocks(page)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(block.text)
    } catch {
      continue
    }
    for (const node of nodes(parsed)) {
      const name = clean(node.name)
      if (name === null) continue
      const types = typesOf(node)
      if (types.some((type) => ORGANIZATION.test(type))) return { name, source: 'organization' }
      if (website === null && types.includes('WebSite')) website = name
    }
  }
  if (website !== null) return { name: website, source: 'website' }
  const og = (page.html?.metas ?? []).find(
    (meta) => meta.property?.toLowerCase() === 'og:site_name',
  )
  const site = clean(og?.content)
  if (site !== null) return { name: site, source: 'og-site-name' }
  const title = clean(page.html?.title?.split(TITLE_SEPARATOR)[0])
  return title === null ? null : { name: title, source: 'title' }
}

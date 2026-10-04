/**
 * What Google's Knowledge Graph Search API (entities:search) knows of a brand's name, asked in
 * Arabic and in English. The engine asks the API; this reads its answers.
 */
export interface KnowledgeGraphEntity {
  /** The language the entity was asked for in. */
  readonly lang: 'ar' | 'en'
  readonly name: string
  /** schema.org types other than Thing, at most 6: Organization, Corporation, Brand... */
  readonly types: readonly string[]
  readonly description: string | null
  /** The article's address, when Google gives a Wikipedia one. */
  readonly wikipediaUrl: string | null
}

export interface KnowledgeGraphFacts {
  /** known: an entity of that name; unknown: none; no-name: the page gives no brand name; failed: no answer. */
  readonly outcome: 'known' | 'unknown' | 'no-name' | 'failed'
  /** A failure because the API refused the request (400, 401 or 403): the key, most often. */
  readonly refused?: boolean
  /** The name asked about. */
  readonly brand: string | null
  /** At most one for each language. */
  readonly entities: readonly KnowledgeGraphEntity[]
}

export interface KnowledgeGraphAnswer {
  readonly status: number | null
  readonly body: unknown
}

const REFUSED: ReadonlySet<number> = new Set([400, 401, 403])
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A name as compared: letters and digits alone, without marks, tatweel or case. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{M}ـ]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

/** The same name: equal, or one the start of the other ("Acme" and "Acme Inc"), two letters at least. */
function sameName(a: string, b: string): boolean {
  const left = normalizeName(a)
  const right = normalizeName(b)
  return left.length >= 2 && right.length >= 2 && (left.startsWith(right) || right.startsWith(left))
}

function entityOf(
  lang: 'ar' | 'en',
  brand: string,
  body: unknown,
): KnowledgeGraphEntity | null | undefined {
  if (!isObject(body)) return undefined
  const items = body.itemListElement
  if (!Array.isArray(items)) return null
  for (const item of items as unknown[]) {
    const result = isObject(item) ? item.result : undefined
    if (!isObject(result) || typeof result.name !== 'string' || !sameName(result.name, brand)) {
      continue
    }
    const types = (Array.isArray(result['@type']) ? (result['@type'] as unknown[]) : [])
      .filter((type): type is string => typeof type === 'string' && type !== 'Thing')
      .slice(0, 6)
    const detailed = isObject(result.detailedDescription) ? result.detailedDescription : {}
    let wikipediaUrl: string | null = null
    if (typeof detailed.url === 'string') {
      try {
        const url = new URL(detailed.url)
        if (url.protocol === 'https:' && /(?:^|\.)wikipedia\.org$/.test(url.hostname)) {
          wikipediaUrl = url.href.slice(0, 2048)
        }
      } catch {
        // Not an address: none.
      }
    }
    const description =
      typeof result.description === 'string' && result.description !== ''
        ? result.description.slice(0, 200)
        : null
    return { lang, name: result.name.slice(0, 200), types, description, wikipediaUrl }
  }
  return null
}

/** Reads the two answers; a language that answered and had the entity is enough. */
export function collectKnowledgeGraph(input: {
  readonly brand: string
  readonly ar: KnowledgeGraphAnswer
  readonly en: KnowledgeGraphAnswer
}): KnowledgeGraphFacts {
  const { brand } = input
  const answers = [
    ['ar', input.ar],
    ['en', input.en],
  ] as const
  if (answers.some(([, answer]) => answer.status !== null && REFUSED.has(answer.status))) {
    return { outcome: 'failed', refused: true, brand, entities: [] }
  }
  const entities: KnowledgeGraphEntity[] = []
  let answered = 0
  for (const [lang, answer] of answers) {
    if (answer.status !== 200) continue
    const entity = entityOf(lang, brand, answer.body)
    if (entity === undefined) continue
    answered += 1
    if (entity !== null) entities.push(entity)
  }
  if (entities.length > 0) return { outcome: 'known', brand, entities }
  return { outcome: answered > 0 ? 'unknown' : 'failed', brand, entities: [] }
}

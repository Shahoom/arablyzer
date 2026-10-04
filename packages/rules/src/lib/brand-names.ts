import type { PageFacts } from '@arablyzer/collectors'
import { nameKey, scriptOf, type NameScript } from './ar-normalize'
import { nodes, typesOf } from './brand'
import { jsonLdBlocks } from './jsonld'

/** Where a brand name was read; language-neutral, since the findings are read in both languages. */
export type NameSource =
  | 'Organization.name'
  | 'WebSite.name'
  | 'og:site_name'
  | 'title'
  | 'alternateName'
  | 'logo alt'
  | 'copyright'
  | 'h1'

export interface NameCandidate {
  readonly name: string
  readonly source: NameSource
  readonly script: NameScript
  readonly key: string
}

/** Sources that name the site, as opposed to a title or heading that merely mentions it. */
const NAMING: ReadonlySet<NameSource> = new Set([
  'Organization.name',
  'WebSite.name',
  'og:site_name',
  'alternateName',
  'logo alt',
  'copyright',
])

/** In order of trust: the first of a script is the one the others are held against. */
const TRUST: readonly NameSource[] = [
  'Organization.name',
  'WebSite.name',
  'og:site_name',
  'alternateName',
  'logo alt',
  'copyright',
]

const MAX_NAME = 80
const MAX_WORDS = 6
const ORGANIZATION = /(?:Organization|Corporation|Store|Business|Brand)$/
const LOGO_WORDS =
  /\b(?:logo|logotype|brand|home(?:page)?)\b|شعار|لوغو|الرئيسية|الصفحة الرئيسية|logo/giu
const COPYRIGHT_LEAD =
  /(?:©|\(c\)|copyright|حقوق\s+(?:النشر|الطبع)|جميع\s+الحقوق(?:\s+محفوظة)?(?:\s+(?:ل|لـ))?)/iu
const LEGAL_SUFFIX =
  /\s+(?:llc|l\.l\.c|ltd|inc|co|corp|est|fze|w\.l\.l|ش\.?م\.?م|ذ\.?م\.?م|المحدودة|للتجارة)\.?$/iu

const clean = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const name = value.replace(/\s+/g, ' ').trim()
  if (name.length < 2 || name.length > MAX_NAME) return null
  if (name.split(' ').length > MAX_WORDS) return null
  return name
}

const candidate = (name: string | null, source: NameSource): NameCandidate[] => {
  if (name === null) return []
  const key = nameKey(name)
  return key.length < 2 ? [] : [{ name, source, script: scriptOf(name), key }]
}

/** The brand named in a footer line: after the year, a © or the "all rights reserved" lead. */
export function copyrightName(line: string): string | null {
  const text = line.replace(/\s+/g, ' ').trim()
  if (text.length > 200 || !COPYRIGHT_LEAD.test(text)) return null
  let rest = text
    .replace(/^.*?(?:©|\(c\)|copyright|حقوق\s+(?:النشر|الطبع))\s*/iu, '')
    .replace(/^(?:\d{4}|[٠-٩]{4})(?:\s*[-–]\s*(?:\d{4}|[٠-٩]{4}))?\s*/u, '')
  if (rest === text) {
    rest = text.replace(/^.*?جميع\s+الحقوق\s+محفوظة\s*(?:ل|لـ)?\s*/u, '')
  }
  rest = rest
    .replace(/^(?:by|لـ?|ل)\s+/iu, '')
    .replace(/[.|،,؛;–—-].*$/u, '')
    .replace(/\b(?:all rights reserved)\b.*$/iu, '')
    .replace(/جميع الحقوق.*$/u, '')
    .replace(LEGAL_SUFFIX, '')
    .trim()
  return clean(rest)
}

/** What a logo's alt text says the brand is: the alt without «logo» or «شعار». */
export function logoName(alt: string): string | null {
  return clean(
    alt
      .replace(LOGO_WORDS, ' ')
      .replace(/[-_|:]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

function* alternates(value: unknown): Generator<string> {
  if (typeof value === 'string') yield value
  else if (Array.isArray(value)) for (const item of value as unknown[]) yield* alternates(item)
}

export interface BrandNames {
  /** Every name found, in the order of TRUST then the headings. */
  readonly candidates: readonly NameCandidate[]
  /** The JSON-LD Organization and WebSite nodes' names and alternateNames, per node. */
  readonly structured: readonly {
    readonly names: readonly string[]
    readonly alternate: readonly string[]
  }[]
  readonly title: string | null
  readonly h1: string | null
}

/** Reads every place a page says what its brand is called. */
export function collectBrandNames(page: PageFacts): BrandNames {
  const found: NameCandidate[] = []
  const structured: { names: string[]; alternate: string[] }[] = []
  for (const block of jsonLdBlocks(page)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(block.text)
    } catch {
      continue
    }
    for (const node of nodes(parsed)) {
      const types = typesOf(node)
      const organization = types.some((type) => ORGANIZATION.test(type))
      const website = types.includes('WebSite')
      if (!organization && !website) continue
      const name = clean(node.name)
      found.push(...candidate(name, organization ? 'Organization.name' : 'WebSite.name'))
      const alternate = [...alternates(node.alternateName)].flatMap((value) => {
        const text = clean(value)
        return text === null ? [] : [text]
      })
      for (const text of alternate) found.push(...candidate(text, 'alternateName'))
      structured.push({ names: name === null ? [] : [name], alternate })
    }
  }
  const html = page.html
  const og = (html?.metas ?? []).find((meta) => meta.property?.toLowerCase() === 'og:site_name')
  found.push(...candidate(clean(og?.content), 'og:site_name'))
  const trimmed = html?.title?.replace(/\s+/g, ' ').trim()
  const title = trimmed === undefined || trimmed === '' ? null : trimmed
  for (const alt of html?.textAlternatives ?? []) {
    if (alt.source === 'alt' && /logo|brand|شعار/i.test(`${alt.snippet ?? ''} ${alt.text}`)) {
      found.push(...candidate(logoName(alt.text), 'logo alt'))
    }
  }
  for (const segment of page.text?.segments ?? []) {
    if (segment.code || segment.text.length > 200) continue
    const name = copyrightName(segment.text)
    if (name !== null) {
      found.push(...candidate(name, 'copyright'))
      break
    }
  }
  const h1 = html?.headings.find((heading) => heading.level === 1)?.text ?? null
  found.sort((a, b) => TRUST.indexOf(a.source) - TRUST.indexOf(b.source))
  return { candidates: found, structured, title, h1 }
}

/** Two names agree when their keys are equal, or one holds the other (a store and its brand). */
export function agree(a: NameCandidate, b: NameCandidate): boolean {
  if (a.key === b.key) return true
  const [short, long] = a.key.length <= b.key.length ? [a, b] : [b, a]
  return short.key.length >= 3 && long.key.includes(short.key)
}

export type BrandIssue =
  | { readonly kind: 'disagree'; readonly first: NameCandidate; readonly second: NameCandidate }
  | { readonly kind: 'spelling'; readonly first: NameCandidate; readonly second: NameCandidate }
  | {
      readonly kind: 'alternate-missing'
      readonly arabic: NameCandidate
      readonly latin: NameCandidate
    }

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim()

/** Whether an Arabic text holds the name exactly as written (case and spaces apart). */
function writtenIn(text: string, name: string): boolean {
  return collapse(text).includes(collapse(name))
}

/**
 * The disagreements of a page's brand names. Within one script, every naming source is held
 * against the most trusted one: not agreeing is a disagreement, agreeing with a different Arabic
 * spelling is a spelling difference. The headings and the title only mention the brand, so they
 * can show a spelling difference and never a disagreement. Across scripts nothing is compared
 * (that would need a transliteration); the page is asked instead to pair its Arabic and Latin
 * forms in `alternateName`.
 */
export function brandIssues(names: BrandNames): BrandIssue[] {
  const issues: BrandIssue[] = []
  const seen = new Set<string>()
  const add = (issue: BrandIssue, id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    issues.push(issue)
  }
  for (const script of ['ar', 'latin'] as const) {
    const ofScript = names.candidates.filter(
      (item) => item.script === script && NAMING.has(item.source),
    )
    const reference = ofScript[0]
    if (reference === undefined) continue
    for (const other of ofScript.slice(1)) {
      if (!agree(reference, other)) {
        add(
          { kind: 'disagree', first: reference, second: other },
          `d:${reference.key}:${other.key}`,
        )
      } else if (
        script === 'ar' &&
        reference.key === other.key &&
        collapse(reference.name) !== collapse(other.name)
      ) {
        add(
          { kind: 'spelling', first: reference, second: other },
          `s:${reference.key}:${other.name}`,
        )
      }
    }
    if (script === 'ar') {
      for (const text of [names.title, names.h1]) {
        if (text === null) continue
        const source: NameSource = text === names.title ? 'title' : 'h1'
        if (!nameKey(text).includes(reference.key) || writtenIn(text, reference.name)) continue
        // The text holds the name in other letters: find the words of it that fold to the key.
        const words = text.split(/[\s|–—·•:,-]+/)
        const widths = reference.name.split(/\s+/).length
        for (let start = 0; start + widths <= words.length; start++) {
          const phrase = words.slice(start, start + widths).join(' ')
          if (nameKey(phrase) === reference.key && collapse(phrase) !== collapse(reference.name)) {
            add(
              {
                kind: 'spelling',
                first: reference,
                second: { name: phrase, source, script: 'ar', key: reference.key },
              },
              `s:${reference.key}:${phrase}`,
            )
            break
          }
        }
      }
    }
  }
  const arabic = names.candidates.find((item) => item.script === 'ar' && NAMING.has(item.source))
  const latin = names.candidates.find((item) => item.script === 'latin' && NAMING.has(item.source))
  if (arabic !== undefined && latin !== undefined && arabic.source !== latin.source) {
    const paired = names.structured.some((node) => {
      const all = [...node.names, ...node.alternate]
      return (
        all.some((name) => scriptOf(name) === 'ar') &&
        all.some((name) => scriptOf(name) === 'latin')
      )
    })
    if (!paired) add({ kind: 'alternate-missing', arabic, latin }, 'alt')
  }
  return issues
}

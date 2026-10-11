import type {
  GscScriptShare,
  KeywordScript,
  SuggestGroup,
  SuggestResponse,
} from '@arablyzer/api-contract/codes'

// The search-data tools' logic that needs no browser (M5.3): what the forms accept, how numbers
// read, and the CSV the suggestion tree and the opportunities are downloaded as.

/** Latin digits, left to right, so a row reads the same in both languages (as the report's card). */
export const NUMBER = new Intl.NumberFormat('en', { maximumFractionDigits: 0 })
export const DECIMAL = new Intl.NumberFormat('en', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
})
export const PERCENT = new Intl.NumberFormat('en', {
  style: 'percent',
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
})
export const PERCENT_WHOLE = new Intl.NumberFormat('en', {
  style: 'percent',
  maximumFractionDigits: 0,
})

const MAX_TERM = 60

const words = (text: string): number => text.split(' ').length

/** A seed: two characters to four words, 60 at most, no control characters; spaces folded. */
export function parseSeed(input: string): string | null {
  if (/[\p{Cc}<>]/u.test(input)) return null
  const seed = input.replace(/\s+/g, ' ').trim()
  if (seed.length < 2 || seed.length > MAX_TERM || words(seed) > 4) return null
  return /[\p{L}\p{N}]/u.test(seed) ? seed : null
}

/**
 * The queries of a text area, one a line, empty lines and repeats dropped; one to five, each
 * two characters to eight words. Null when the text is not that.
 */
export function parseQueries(input: string): string[] | null {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
  const distinct = [...new Set(lines)]
  if (distinct.length < 1 || distinct.length > 5) return null
  for (const line of distinct) {
    if (line.length < 2 || line.length > MAX_TERM || words(line) > 8 || /[\p{Cc}<>]/u.test(line)) {
      return null
    }
    if (!/[\p{L}\p{N}]/u.test(line)) return null
  }
  return distinct
}

/** The domain typed, as a host name (no scheme, path, port or `www.`); '' when empty; null if not one. */
export function parseDomain(input: string): string | null {
  const typed = input.trim()
  if (typed === '') return ''
  const host = typed
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .split(/[/?#]/, 1)[0]
    ?.toLowerCase()
    .replace(/^www\./, '')
  if (host === undefined || host === '' || host.includes('@') || host.includes(':')) return null
  return /^(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+[\p{L}\p{N}-]{2,}$/u.test(host)
    ? host
    : null
}

/** A cell as a spreadsheet reads it: quoted when needed, and never a formula (OWASP's CSV injection). */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

/** UTF-8 byte order mark: Excel reads Arabic in a file only when it starts with it. */
export const BOM = '﻿'

/** The rows as a CSV text, with the BOM, CRLF line ends (RFC 4180). */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return BOM + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** The suggestion tree as CSV rows: the group, what was added, the suggestion. */
export function suggestRows(
  response: SuggestResponse,
  header: readonly [string, string, string],
  groupName: (kind: SuggestGroup['kind']) => string,
): string[][] {
  return [
    [...header],
    ...response.groups.flatMap((group) =>
      group.suggestions.map((suggestion) => [groupName(group.kind), group.trigger, suggestion]),
    ),
  ]
}

/** The Arabic marks and tatweel, which a search inside the list ignores. */
const MARKS = /[ؐ-ًؚ-ٰٟـ]/g
const fold = (text: string): string =>
  text
    .normalize('NFKC')
    .replace(MARKS, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase()

/** The groups' suggestions that contain what was typed (spellings folded); empty groups dropped. */
export function filterGroups(groups: readonly SuggestGroup[], typed: string): SuggestGroup[] {
  const needle = fold(typed.trim())
  if (needle === '') return [...groups]
  return groups
    .map((group) => ({
      ...group,
      suggestions: group.suggestions.filter((suggestion) => fold(suggestion).includes(needle)),
    }))
    .filter((group) => group.suggestions.length > 0)
}

/** The Arabic share of impressions, 0 to 1; null when no query was classified. */
export function arabicShare(
  scripts: Readonly<Record<KeywordScript, GscScriptShare>>,
): number | null {
  const total = Object.values(scripts).reduce((sum, share) => sum + share.impressions, 0)
  return total === 0 ? null : scripts.arabic.impressions / total
}

/**
 * Each script's part of the impressions, in a fixed order, with where its segment of a bar of
 * width 100 starts: the stacked bar is drawn from these (an SVG's own attributes, no style).
 */
export function scriptParts(
  scripts: Readonly<Record<KeywordScript, GscScriptShare>>,
): { script: KeywordScript; share: number; x: number }[] {
  const order: KeywordScript[] = ['arabic', 'mixed', 'latin', 'other']
  const total = order.reduce((sum, script) => sum + scripts[script].impressions, 0)
  let x = 0
  return order.map((script) => {
    const share = total === 0 ? 0 : scripts[script].impressions / total
    const part = { script, share, x }
    x += share * 100
    return part
  })
}

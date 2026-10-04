// Vendors a trimmed, pinned subset of the webappanalyzer fingerprints (GPL-3.0) into
// vendor/webappanalyzer/. Given a checkout of https://github.com/enthec/webappanalyzer at COMMIT
// (git clone, then git checkout COMMIT):
//   pnpm --filter @arablyzer/rules exec tsx scripts/vendor-platforms.ts <path of the checkout>
// The subset keeps the categories below, the technologies they imply, and, of each, only the
// patterns a scan can read without running the page (headers, cookies, meta tags, script
// addresses, the markup's address-bearing tags and the page's URL). Change COMMIT to update.
import { readFileSync, writeFileSync } from 'node:fs'

const COMMIT = 'eea872af449e207e055398f7369d11ee48c8ea03'
const CHECKOUT = process.argv[2]
if (CHECKOUT === undefined) throw new Error('Give the path of a webappanalyzer checkout')
const FILES = ['_', ...'abcdefghijklmnopqrstuvwxyz'.split('')]
/** CMS, e-commerce, page builders, analytics, CDN, JS frameworks, blogs, web frameworks, tag managers, WordPress plugins. */
const KEEP = new Set([1, 6, 51, 10, 31, 12, 11, 18, 42, 87])
const FIELDS = ['headers', 'cookies', 'meta', 'scriptSrc', 'html', 'url'] as const

type Raw = Record<string, unknown> & { cats?: number[]; implies?: string | string[] }
const OUT = new URL('../vendor/webappanalyzer/', import.meta.url)

function get(path: string): string {
  return readFileSync(`${CHECKOUT}/${path}`, 'utf8')
}

const all: Record<string, Raw> = {}
for (const file of FILES) {
  Object.assign(all, JSON.parse(get(`src/technologies/${file}.json`)) as Record<string, Raw>)
}
const impliedNames = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value : value === undefined ? [] : [value]).map(
    (item) => item.split(String.raw`\;`)[0] ?? '',
  )
const selected = new Set(
  Object.entries(all)
    .filter(([, tech]) => (tech.cats ?? []).some((cat) => KEEP.has(cat)))
    .map(([name]) => name),
)
for (let grew = true; grew;) {
  grew = false
  for (const name of [...selected]) {
    for (const implied of impliedNames(all[name]?.implies)) {
      if (implied in all && !selected.has(implied)) {
        selected.add(implied)
        grew = true
      }
    }
  }
}
const techs: Record<string, Record<string, unknown>> = {}
for (const name of [...selected].sort()) {
  const tech = all[name]
  if (tech === undefined || !FIELDS.some((field) => tech[field] !== undefined)) continue
  const kept: Record<string, unknown> = { cats: tech.cats ?? [] }
  for (const field of [...FIELDS, 'implies', 'website'] as const) {
    if (tech[field] !== undefined) kept[field] = tech[field]
  }
  techs[name] = kept
}
const categories = JSON.parse(get('src/categories.json')) as Record<string, { name: string }>
const names: Record<string, string> = {}
for (const id of KEEP) names[String(id)] = categories[String(id)]?.name ?? ''
writeFileSync(
  new URL('fingerprints.json', OUT),
  JSON.stringify({ commit: COMMIT, categories: names, techs }),
)
writeFileSync(new URL('LICENSE', OUT), get('LICENSE'))
console.log(`${Object.keys(techs).length} technologies from ${COMMIT}`)

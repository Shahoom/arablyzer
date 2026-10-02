import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { serveSite } from '@arablyzer/fixtures'
import { builtPages, representativePages } from '@arablyzer/seo/audit'
import * as chromeLauncher from 'chrome-launcher'
import lighthouse from 'lighthouse'
import desktopConfig from 'lighthouse/core/config/desktop-config.js'

// CI step "Lighthouse on the site" (M2.1 plan §3): the built pages, served with gzip as a
// production server sends them, measured in all four categories on a phone and a desktop, each
// --runs times; the gate reads the median run. Accessibility, best practices and SEO must score
// 100; performance at least --min-mobile and --min-desktop, since its runs vary with the machine.
// CHROME_PATH names the Chromium to run; the browsers job uses Playwright's. --out keeps the
// scores as JSON, --lhr every Lighthouse result.
const { values } = parseArgs({
  options: {
    'min-mobile': { type: 'string', default: '0' },
    'min-desktop': { type: 'string', default: '0' },
    out: { type: 'string' },
    runs: { type: 'string', default: '3' },
    lhr: { type: 'string' },
  },
})
const runs = Number(values.runs)
const minimum = { mobile: Number(values['min-mobile']), desktop: Number(values['min-desktop']) }
const chromePath = process.env.CHROME_PATH
if (chromePath === undefined || chromePath === '') {
  throw new Error('Set CHROME_PATH to the Chromium to measure with')
}

const DIST = fileURLToPath(new URL('../dist/', import.meta.url))
/**
 * The pages that stand for the rest (packages/seo): every page but the report pages and the
 * pages past the first of their template in each language (tools, rules, guides, glossary terms).
 */
const PAGES = representativePages(builtPages(DIST)).map((page) => page.path)
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'] as const
const FORMS = ['mobile', 'desktop'] as const
const TOTAL_RUNS = PAGES.length * FORMS.length * runs

interface Measured {
  readonly page: string
  readonly form: (typeof FORMS)[number]
  readonly scores: Readonly<Record<(typeof CATEGORIES)[number], number | null>>
  readonly metrics: Readonly<Record<string, number | null>>
  /** Audits below a full score in each category, for a readable failure. */
  readonly misses: readonly string[]
}

const METRICS = [
  'first-contentful-paint',
  'largest-contentful-paint',
  'total-blocking-time',
  'cumulative-layout-shift',
  'speed-index',
]

// What is to be measured, said first and as it goes: the scores come at the end, and a run that
// CI's time limit ends would otherwise say nothing of how much work it was.
console.log(`Lighthouse: ${PAGES.length} pages, ${FORMS.length} forms, ${runs} runs: ${TOTAL_RUNS}`)

const site = await serveSite(DIST, { compressText: true, cleanUrls: true })
const chrome = await chromeLauncher.launch({
  chromePath,
  // Ubuntu's runners forbid the user namespaces Chromium's sandbox needs; the pages are ours
  // and the runner is thrown away, so CI runs it without one, as Playwright does.
  chromeFlags: [
    '--headless=new',
    '--disable-gpu',
    ...(process.env.CI === 'true' ? ['--no-sandbox'] : []),
  ],
})
const measured: Measured[] = []
try {
  for (const page of PAGES) {
    for (const form of FORMS) {
      for (let run = 0; run < runs; run++) {
        const result = await lighthouse(
          site.url(page),
          {
            port: chrome.port,
            output: 'json',
            logLevel: 'error',
            onlyCategories: [...CATEGORIES],
          },
          form === 'desktop' ? desktopConfig : undefined,
        )
        const lhr = result?.lhr
        if (lhr === undefined) throw new Error(`Lighthouse returned nothing for ${page} (${form})`)
        if (values.lhr !== undefined) {
          const name = `${page.replaceAll('/', '_')}-${form}-${run}.json`
          await writeFile(
            path.join(path.resolve(process.env.INIT_CWD ?? process.cwd(), values.lhr), name),
            JSON.stringify(lhr),
          )
        }
        if (lhr.runtimeError !== undefined) {
          throw new Error(`${page} (${form}): ${lhr.runtimeError.code} ${lhr.runtimeError.message}`)
        }
        const score = (id: string) => {
          const value = lhr.categories[id]?.score
          return typeof value === 'number' ? Math.round(value * 100) : null
        }
        const misses = CATEGORIES.flatMap((category) =>
          (lhr.categories[category]?.auditRefs ?? [])
            .filter((ref) => ref.weight > 0)
            .map((ref) => lhr.audits[ref.id])
            .filter((audit) => audit !== undefined && audit.score !== null && audit.score < 1)
            .map(
              (audit) => `${category}: ${audit?.id ?? ''} (${audit?.displayValue ?? audit?.score})`,
            ),
        )
        measured.push({
          page,
          form,
          scores: {
            performance: score('performance'),
            accessibility: score('accessibility'),
            'best-practices': score('best-practices'),
            seo: score('seo'),
          },
          metrics: Object.fromEntries(
            METRICS.map((id) => [id, lhr.audits[id]?.numericValue ?? null]),
          ),
          misses,
        })
      }
      console.log(`measured ${page} (${form}): ${measured.length} of ${TOTAL_RUNS} runs`)
    }
  }
} finally {
  chrome.kill()
  await site.close()
}

for (const { page, form, scores, metrics, misses } of measured) {
  const line = CATEGORIES.map((category) => `${category} ${scores[category] ?? '-'}`).join(' · ')
  const times = METRICS.map((id) => {
    const value = metrics[id]
    return `${id.replace(/-/g, ' ')} ${value === null || value === undefined ? '-' : id === 'cumulative-layout-shift' ? value.toFixed(3) : `${Math.round(value)} ms`}`
  }).join(' · ')
  console.log(`${page} (${form}): ${line}\n  ${times}`)
  for (const miss of misses) console.log(`  - ${miss}`)
}

if (values.out !== undefined) {
  const out = path.resolve(process.env.INIT_CWD ?? process.cwd(), values.out)
  await writeFile(out, `${JSON.stringify(measured, null, 2)}\n`)
}

/** The median of a page's runs in one form, category by category. */
function median(page: string, form: (typeof FORMS)[number], category: (typeof CATEGORIES)[number]) {
  const scores = measured
    .filter((result) => result.page === page && result.form === form)
    .map((result) => result.scores[category] ?? 0)
    .sort((a, b) => a - b)
  return scores[Math.floor(scores.length / 2)] ?? 0
}

const failures: string[] = []
for (const page of PAGES) {
  for (const form of FORMS) {
    const medians = CATEGORIES.map((category) => [category, median(page, form, category)] as const)
    console.log(`median ${page} (${form}): ${medians.map(([c, v]) => `${c} ${v}`).join(' · ')}`)
    for (const [category, value] of medians) {
      const floor = category === 'performance' ? minimum[form] : 100
      if (value < floor) failures.push(`${page} (${form}) ${category} ${value} < ${floor}`)
    }
  }
}
if (failures.length > 0) {
  console.error(`Lighthouse: ${failures.join('; ')}`)
  process.exitCode = 1
}

import type { SotawStrings } from '@arablyzer/i18n'
import { count, fill, pct, round, size, span } from './sotaw-format'
import type { Aggregates } from '@arablyzer/sotaw/aggregate'
import { CRAWL_DEFAULTS } from '@arablyzer/sotaw/config'
import { COUNTRIES, countryByCode } from '@arablyzer/sotaw/countries'
import { estimate } from '@arablyzer/sotaw/estimate'
import { FRAME_CAP } from '@arablyzer/sotaw/frame'
import { HEADLINE_METRICS } from '@arablyzer/sotaw/metrics'
import type { Lang } from '@arablyzer/seo/site'

// «حالة الويب العربي» (M9): what the page shows, built from the committed frame and, when there is
// one, the newest edition (scripts/sotaw-data.ts). Everything here is a pure function of that data
// and the copy, so the page is the same in a test as in the build, with or without an edition.

export interface FrameInfo {
  readonly listId: string
  readonly listCreatedOn: string | null
  readonly total: number
  readonly cap: number
  readonly floor: number
  readonly seed: string
  readonly populations: Readonly<Record<string, number>>
  readonly sha256: string
}

export interface EditionFile {
  readonly name: string
  readonly bytes: number
  readonly sha256: string
  readonly description: string
}

export interface EditionData {
  readonly id: string
  readonly aggregates: Aggregates
  readonly files: readonly EditionFile[]
}

export interface SotawData {
  readonly frame: FrameInfo | null
  readonly edition: EditionData | null
}

/** The folder an edition's files are served from. */
export const dataPath = (edition: string): string => `/data/state-of-arabic-web/${edition}`

/** The values the methodology's lines are filled in with: each is the code's own number. */
export function methodValues(minCell: number, email: string): Record<string, string | number> {
  return {
    min: minCell,
    interval: CRAWL_DEFAULTS.intervalSeconds,
    cap: count(FRAME_CAP),
    email,
  }
}

export const countryName = (code: string, lang: Lang): string => {
  const country = countryByCode(code)
  return country === undefined ? code : country[lang]
}

const PLATFORM_NAMES: Readonly<Record<string, string>> = {
  salla: 'Salla',
  zid: 'Zid',
  wordpress: 'WordPress',
  woocommerce: 'WooCommerce',
  shopify: 'Shopify',
  wix: 'Wix',
  squarespace: 'Squarespace',
  magento: 'Magento',
  joomla: 'Joomla',
  drupal: 'Drupal',
  opencart: 'OpenCart',
  prestashop: 'PrestaShop',
  webflow: 'Webflow',
  expandcart: 'ExpandCart',
}

/** A platform as it is written: its brand's spelling when it is known, else its id in words. */
export function platformName(id: string): string {
  return (
    PLATFORM_NAMES[id] ??
    id
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  )
}

// The headline numbers.

export interface Finding {
  readonly id: string
  readonly title: string
  readonly value: string
  readonly lo: string
  readonly hi: string
  readonly n: number
}

/** The six headline metrics that have a whole-sample figure to show. */
export function findings(edition: Aggregates, copy: SotawStrings): Finding[] {
  return HEADLINE_METRICS.flatMap((id) => {
    const found = estimate(edition, { country: null, platform: null }, id)
    if (found?.yes == null) return []
    return [
      {
        id,
        title: copy.metrics[id]?.title ?? id,
        value: pct(found.yes.p),
        lo: pct(found.yes.lo),
        hi: pct(found.yes.hi),
        n: found.n,
      },
    ]
  })
}

// The country charts.

export interface Bar {
  readonly code: string
  readonly name: string
  readonly n: number
  readonly p: number
  readonly lo: number
  readonly hi: number
  /** On the chart's 0 to 100 scale, from the start of the line: the bar's length, and the interval's ends. */
  readonly length: number
  readonly from: number
  readonly to: number
}

export interface Chart {
  readonly metric: string
  readonly title: string
  readonly hint: string
  /** The scale's end as a share: the largest interval's end, rounded up to 5%. */
  readonly max: number
  readonly bars: readonly Bar[]
  /** The countries with too few pages judged for this metric, by name. */
  readonly hidden: readonly string[]
}

/** The chart of one metric by country: the countries with enough pages, largest share first. */
export function countryChart(
  edition: Aggregates,
  metric: string,
  lang: Lang,
  copy: SotawStrings,
): Chart {
  const rows = COUNTRIES.flatMap(({ code }) => {
    const found = estimate(edition, { country: code, platform: null }, metric)
    return found?.yes == null
      ? []
      : [{ code, n: found.n, p: found.yes.p, lo: found.yes.lo, hi: found.yes.hi }]
  })
  rows.sort((a, b) => b.p - a.p || (a.code < b.code ? -1 : 1))
  const widest = Math.max(0.05, ...rows.map((row) => row.hi))
  const max = Math.min(1, Math.ceil(widest * 20) / 20)
  const shown = new Set(rows.map((row) => row.code))
  return {
    metric,
    title: copy.metrics[metric]?.title ?? metric,
    hint: copy.metrics[metric]?.hint ?? '',
    max,
    bars: rows.map((row) => ({
      ...row,
      name: countryName(row.code, lang),
      length: round((row.p / max) * 100),
      from: round((row.lo / max) * 100),
      to: round((row.hi / max) * 100),
    })),
    hidden: edition.countries
      .filter((c) => c.n > 0 && !shown.has(c.code))
      .map((c) => countryName(c.code, lang)),
  }
}

// The platforms and the funnel.

export interface PlatformRow {
  readonly id: string
  readonly name: string
  readonly n: number
  readonly share: number
  readonly length: number
}

/**
 * The named platforms and the rest. The rest is the sites reached less those named, so no small
 * platform's count is published (a platform is named when enough pages share it).
 */
export function platformRows(edition: Aggregates, copy: SotawStrings): PlatformRow[] {
  const reached = edition.funnel.reached
  if (reached === 0) return []
  const named = edition.platforms.map((p) => ({ id: p.id, name: platformName(p.id), n: p.n }))
  const rest = reached - named.reduce((sum, p) => sum + p.n, 0)
  const rows = [
    ...named,
    ...(rest > 0 ? [{ id: 'other', name: copy.platforms.other, n: rest }] : []),
  ]
  const widest = Math.max(...rows.map((row) => row.n / reached))
  return rows.map((row) => ({
    ...row,
    share: row.n / reached,
    length: round((row.n / reached / widest) * 100),
  }))
}

export interface FunnelRow {
  readonly key: string
  readonly label: string
  readonly n: number
}

export function funnelRows(edition: Aggregates, copy: SotawStrings): FunnelRow[] {
  const { funnel } = edition
  const reasons = Object.entries(funnel.skipped)
    .sort(([, a], [, b]) => b - a)
    .map(([key, n]) => ({
      key: `skipped-${key}`,
      label: copy.funnel.reasons[key] ?? copy.funnel.reasons.other ?? key,
      n,
    }))
  return [
    { key: 'frame', label: copy.funnel.frame, n: funnel.frame },
    { key: 'reached', label: copy.funnel.reached, n: funnel.reached },
    ...reasons,
    ...(funnel.failed > 0 ? [{ key: 'failed', label: copy.funnel.failed, n: funnel.failed }] : []),
    ...(funnel.pending > 0
      ? [{ key: 'pending', label: copy.funnel.pending, n: funnel.pending }]
      : []),
  ]
}

// The frame before any crawl.

export function frameRows(
  frame: FrameInfo,
  lang: Lang,
): { code: string; name: string; n: number }[] {
  return COUNTRIES.map(({ code }) => ({
    code,
    name: countryName(code, lang),
    n: frame.populations[code] ?? 0,
  }))
    .filter((row) => row.n > 0)
    .sort((a, b) => b.n - a.n || (a.code < b.code ? -1 : 1))
}

// The citation and the Dataset markup.

export function citation(edition: string, year: string, url: string, lang: Lang): string {
  return lang === 'ar'
    ? `Arablyzer (${year}). حالة الويب العربي، إصدار ${edition} [مجموعة بيانات]. مختبرات كلاود توبيا. ${url}. CC BY 4.0.`
    : `Arablyzer (${year}). State of the Arabic Web, edition ${edition} [Dataset]. CloudTopia Labs. ${url}. CC BY 4.0.`
}

const LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/'
export const LICENSE_LINK = LICENSE_URL

/**
 * schema.org `Dataset`, for Google Dataset Search: only for an edition that exists, with a
 * distribution for each file in its manifest and the variables its metrics measure.
 */
export function datasetJsonLd(options: {
  readonly edition: EditionData
  readonly lang: Lang
  readonly copy: SotawStrings
  readonly pageUrl: string
  readonly origin: string
  readonly organization: { readonly name: string; readonly url: string }
}): Record<string, unknown> {
  const { edition, lang, copy, pageUrl, origin } = options
  const { aggregates } = edition
  const encoding: Record<string, string> = {
    json: 'application/json',
    csv: 'text/csv',
    parquet: 'application/vnd.apache.parquet',
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${copy.title}: ${fill(copy.edition.label, { edition: edition.id })}`,
    description: copy.meta.description,
    url: pageUrl,
    inLanguage: lang,
    version: edition.id,
    license: LICENSE_URL,
    isAccessibleForFree: true,
    creator: {
      '@type': 'Organization',
      name: options.organization.name,
      url: options.organization.url,
    },
    keywords: [
      'Arabic',
      'RTL',
      'web',
      'Arab countries',
      'accessibility',
      'Core Web Vitals',
      'HTTPS',
    ],
    ...(aggregates.crawl.startedAt === null || aggregates.crawl.finishedAt === null
      ? {}
      : {
          temporalCoverage: `${aggregates.crawl.startedAt.slice(0, 10)}/${aggregates.crawl.finishedAt.slice(0, 10)}`,
        }),
    spatialCoverage: aggregates.countries.map((c) => countryName(c.code, 'en')).join(', '),
    measurementTechnique:
      'Arablyzer rules run on the homepage of each site in a published sample frame',
    variableMeasured: aggregates.metrics.map((m) => ({
      '@type': 'PropertyValue',
      name: m.id,
      description: copy.metrics[m.id]?.title ?? m.id,
    })),
    citation: citation(
      edition.id,
      (aggregates.crawl.finishedAt ?? '').slice(0, 4) || edition.id,
      pageUrl,
      'en',
    ),
    distribution: edition.files.map((file) => ({
      '@type': 'DataDownload',
      name: file.name,
      encodingFormat: encoding[file.name.split('.').at(-1) ?? ''] ?? 'application/octet-stream',
      contentUrl: `${origin}${dataPath(edition.id)}/${file.name}`,
      contentSize: `${String(file.bytes)} B`,
      sha256: file.sha256,
    })),
  }
}

export { count, fill, pct, size, span }

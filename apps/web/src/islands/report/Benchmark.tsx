import { REPORT } from '@arablyzer/i18n/report'
import type { Report } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'
import { BENCHMARK, bandOf, type Benchmark, type Metric } from '../../lib/benchmark'

const BANDS = ['best', 'better', 'worse', 'worst'] as const

/** A number as the page shows them: Latin digits, so a row reads the same in both languages. */
const NUMBER = new Intl.NumberFormat('en', { maximumFractionDigits: 0 })
const CLS = new Intl.NumberFormat('en', { maximumFractionDigits: 2, minimumFractionDigits: 2 })

function show(metric: Metric, value: number): string {
  if (metric === 'lcp') return `${NUMBER.format(value)} ms`
  if (metric === 'cls') return CLS.format(value)
  return NUMBER.format(value)
}

/** What the report holds of the metrics the benchmark has: requests from the render, CrUX's p75. */
function measured(report: Report): readonly [Metric, number][] {
  const render = report.scan.render?.find(
    (run) => run.engine === 'chromium' && run.status === 'rendered',
  )
  const rows: [Metric, number | null | undefined][] = [
    ['requests', render?.requests.total],
    ['lcp', report.facts.crux?.lcp],
    ['cls', report.facts.crux?.cls],
  ]
  return rows.flatMap(([metric, value]) =>
    typeof value === 'number' ? [[metric, value] as const] : [],
  )
}

/**
 * "Your page against Arabic sites": the report's requests and Core Web Vitals against the HTTP
 * Archive's and CrUX's percentiles for Arab countries (lib/benchmark.ts). Until the owner has made
 * the numbers, it says there is no benchmark yet; none are ever estimated here.
 */
export function BenchmarkSection({
  report,
  lang,
  benchmark = BENCHMARK,
}: {
  report: Report
  lang: Lang
  benchmark?: Benchmark | null
}) {
  const t = REPORT[lang].benchmark
  const rows = benchmark === null ? [] : measured(report)
  return (
    <section aria-labelledby="benchmark-title" className="card flex flex-col gap-3 p-card">
      <h2 id="benchmark-title" className="heading-3 m-0">
        {t.title}
      </h2>
      {benchmark === null ? (
        <p className="m-0 text-small text-ink-2">{t.none}</p>
      ) : rows.length === 0 ? (
        <p className="m-0 text-small text-ink-2">{t.nothingToCompare}</p>
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {rows.map(([metric, value]) => {
              const at = benchmark.metrics[metric]
              return (
                <li key={metric} className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-small text-ink">
                    {t.metrics[metric as keyof typeof t.metrics]}
                  </span>
                  <span className="text-small text-ink-2">
                    <strong className="font-semibold text-ink">
                      <span dir="ltr" className="tabular-nums">
                        {show(metric, value)}
                      </span>
                    </strong>
                    <span className="ms-3">{t.bands[BANDS[bandOf(value, at)]]}</span>
                    <span className="ms-3">{t.median(show(metric, at.p50))}</span>
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="m-0 text-meta text-ink-2">
            {t.source(benchmark.crawl, NUMBER.format(benchmark.pages))}
          </p>
        </>
      )}
    </section>
  )
}

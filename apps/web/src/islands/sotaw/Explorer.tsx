import type { SotawStrings } from '@arablyzer/i18n'
import type { Aggregates } from '@arablyzer/sotaw/aggregate'
import type { Lang } from '@arablyzer/seo/site'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { count, pct, segments, span } from '../../lib/sotaw-format'
import { isEdition, viewOf, type ExplorerMetric } from './explorer-model'

interface Props {
  lang: Lang
  /** Where the edition's `aggregates.json` is, on this site. */
  src: string
  strings: SotawStrings['explorer']
  metrics: readonly ExplorerMetric[]
  /** The groups' names, by id, for the metric list. */
  groups: Readonly<Record<string, string>>
  countries: readonly { readonly code: string; readonly name: string }[]
  platforms: readonly { readonly id: string; readonly name: string }[]
  minCell: number
  firstMetric: string
}

type Load =
  | { readonly state: 'loading' }
  | { readonly state: 'failed' }
  | { readonly state: 'ready'; readonly edition: Aggregates }

/** A line with its values set apart, each left to right: a count inside Arabic text is drawn out of order. */
function Said({
  text,
  values,
}: {
  text: string
  values: Readonly<Record<string, string | number>>
}) {
  return (
    <>
      {segments(text, values).map((part, index) =>
        part.value ? (
          <bdi key={index} dir="ltr" className="tabular-nums">
            {part.text}
          </bdi>
        ) : (
          part.text
        ),
      )}
    </>
  )
}

const FIELD = 'h-12 min-w-0 rounded-xl border border-field bg-white px-4 text-body text-ink'
const LABEL = 'text-small font-semibold text-ink'

/**
 * The explorer (M9): a country, a platform and a metric, and the distribution of the pages judged.
 * The numbers come from the edition's `aggregates.json`, fetched once when the section is seen; a
 * selection with fewer pages than the edition's smallest cell shows none. Bars are SVG attributes,
 * never `style`, which the site's CSP does not allow.
 */
export default function Explorer({
  lang,
  src,
  strings: t,
  metrics,
  groups,
  countries,
  platforms,
  minCell,
  firstMetric,
}: Props) {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [country, setCountry] = useState('')
  const [platform, setPlatform] = useState('')
  const [metricId, setMetricId] = useState(firstMetric)
  useEffect(() => {
    const controller = new AbortController()
    fetch(src, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('not ok'))))
      .then((body: unknown) => {
        setLoad(isEdition(body) ? { state: 'ready', edition: body } : { state: 'failed' })
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ state: 'failed' })
      })
    return () => {
      controller.abort()
    }
  }, [src])
  const metric = metrics.find((m) => m.id === metricId) ?? metrics[0]
  const view = useMemo(
    () =>
      load.state === 'ready' && metric !== undefined
        ? viewOf(
            load.edition,
            {
              country: country === '' ? null : country,
              platform: platform === '' ? null : platform,
            },
            metric,
          )
        : null,
    [load, country, platform, metric],
  )
  const reading = lang === 'ar'
  const byGroup = [...new Set(metrics.map((m) => m.group))]
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="sotaw-country" className={LABEL}>
            {t.country}
          </label>
          <select
            id="sotaw-country"
            className={FIELD}
            value={country}
            onChange={(event) => {
              setCountry(event.currentTarget.value)
            }}
          >
            <option value="">{t.allCountries}</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="sotaw-platform" className={LABEL}>
            {t.platform}
          </label>
          <select
            id="sotaw-platform"
            className={FIELD}
            value={platform}
            onChange={(event) => {
              setPlatform(event.currentTarget.value)
            }}
          >
            <option value="">{t.allPlatforms}</option>
            {platforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <label htmlFor="sotaw-metric" className={LABEL}>
            {t.metric}
          </label>
          <select
            id="sotaw-metric"
            className={FIELD}
            value={metricId}
            onChange={(event) => {
              setMetricId(event.currentTarget.value)
            }}
          >
            {byGroup.map((group) => (
              <optgroup key={group} label={groups[group] ?? group}>
                {metrics
                  .filter((m) => m.group === group)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>
      <div aria-live="polite" className="card flex flex-col gap-4 p-card">
        {load.state === 'loading' && <p className="m-0 text-body text-ink-2">{t.loading}</p>}
        {load.state === 'failed' && <p className="m-0 text-body text-ink-2">{t.failed}</p>}
        {load.state === 'ready' && view === null && (
          <p className="m-0 text-body text-ink-2">
            <Said text={t.tooFew} values={{ min: minCell }} />
          </p>
        )}
        {load.state === 'ready' && view !== null && metric !== undefined && (
          <>
            <h3 className="heading-3 m-0">{metric.title}</h3>
            {view.yes !== null && (
              <p className="m-0 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span dir="ltr" className="heading-1 tabular-nums">
                  {pct(view.yes.p)}
                </span>
                <span dir="ltr" className="text-small text-ink-2 tabular-nums">
                  {pct(view.yes.lo)} – {pct(view.yes.hi)}
                </span>
              </p>
            )}
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {view.rows.map((row) => {
                const bar = span(0, row.share * 100, reading)
                return (
                  <li
                    key={row.key}
                    className="grid grid-cols-[7.5rem_minmax(0,1fr)_3.25rem] items-center gap-3 text-small"
                  >
                    <bdi className="text-ink">{row.label}</bdi>
                    <svg
                      viewBox="0 0 100 10"
                      preserveAspectRatio="none"
                      className="h-4 w-full"
                      aria-hidden="true"
                    >
                      <rect x="0" y="2" width="100" height="6" className="fill-surface-2" />
                      <rect x={bar.x} y="2" width={bar.width} height="6" className="fill-brand" />
                    </svg>
                    <span dir="ltr" className="text-end font-semibold tabular-nums">
                      {pct(row.share)}
                    </span>
                  </li>
                )
              })}
            </ol>
            <p className="m-0 text-meta text-ink-3">
              <Said text={t.judged} values={{ n: count(view.n) }} />.{' '}
              {view.weighted ? t.weighted : t.pooled}.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

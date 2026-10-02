import { hreflangTags, type HreflangResult } from '@arablyzer/generators'
import { GENERATORS_UI } from '@arablyzer/i18n/generators'
import type { Lang } from '@arablyzer/seo/site'
import type { TargetedSubmitEvent } from 'preact'
import { useState } from 'preact/hooks'
import { CopyBox, FIELD, LABEL, SUBMIT } from './CopyBox'

/** The hreflang generator (M2.3b): the same set of tags for every version of a page. */
export default function HreflangGenerator({ lang, tool }: { lang: Lang; tool: string }) {
  const t = GENERATORS_UI[lang].hreflang
  const common = GENERATORS_UI[lang].common
  const [rows, setRows] = useState([0, 1])
  const [next, setNext] = useState(2)
  const [result, setResult] = useState<{
    rows: readonly { href: string; code: string }[]
    tags: HreflangResult
  } | null>(null)
  const onSubmit = (event: TargetedSubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const text = (name: string) => {
      const entry = data.get(name)
      return typeof entry === 'string' ? entry.trim() : ''
    }
    const filled = rows
      .map((row) => ({ href: text(`href-${String(row)}`), code: text(`code-${String(row)}`) }))
      .filter((row) => row.href !== '' && row.code !== '')
    setResult({ rows: filled, tags: hreflangTags(filled, text('x-default')) })
  }
  return (
    <div className="flex flex-col gap-6" data-tool={tool}>
      <form onSubmit={onSubmit} data-tool-kind="generator" className="flex flex-col gap-4">
        {rows.map((row, index) => (
          <fieldset
            key={row}
            className="m-0 grid gap-3 border-0 p-0 sm:grid-cols-[minmax(0,3fr)_minmax(0,1fr)_auto] sm:items-end"
          >
            <div className="flex flex-col gap-2">
              <label htmlFor={`href-${String(row)}`} className={LABEL}>
                {t.url}
              </label>
              <input
                id={`href-${String(row)}`}
                name={`href-${String(row)}`}
                type="url"
                dir="ltr"
                placeholder={index === 0 ? 'https://example.com/' : 'https://example.com/en/'}
                className={`${FIELD} font-mono`}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor={`code-${String(row)}`} className={LABEL}>
                {t.code}
              </label>
              <input
                id={`code-${String(row)}`}
                name={`code-${String(row)}`}
                type="text"
                dir="ltr"
                placeholder={index === 0 ? 'ar' : 'en'}
                className={`${FIELD} font-mono`}
              />
            </div>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setRows(rows.filter((other) => other !== row))
                }}
                className="h-12 cursor-pointer border border-rule-strong px-4 text-sm hover:border-ink"
              >
                {t.remove}
              </button>
            )}
          </fieldset>
        ))}
        <button
          type="button"
          onClick={() => {
            setRows([...rows, next])
            setNext(next + 1)
          }}
          className="h-10 cursor-pointer self-start border border-ink px-4 text-sm font-semibold hover:text-brand-ink"
        >
          {t.add}
        </button>
        <div className="flex flex-col gap-2">
          <label htmlFor="x-default" className={LABEL}>
            {t.xDefault}
          </label>
          <input
            id="x-default"
            name="x-default"
            type="url"
            dir="ltr"
            aria-describedby="x-default-hint"
            className={`${FIELD} font-mono`}
          />
          <p id="x-default-hint" className="m-0 text-sm text-ink-3">
            {t.xDefaultHint}
          </p>
        </div>
        <button type="submit" className={SUBMIT}>
          {t.submit}
        </button>
        <p className="m-0 text-sm text-ink-3">{common.local}</p>
      </form>
      {result !== null && (
        <section aria-label={common.result} className="flex flex-col gap-3">
          {result.tags.problems.map((problem) => (
            <p key={problem.row} role="alert" className="m-0 text-sm text-serious">
              {t.problem(result.rows[problem.row]?.code ?? '', problem.check.suggestion)}
            </p>
          ))}
          {result.tags.html !== '' && (
            <CopyBox lang={lang} label={t.html} text={result.tags.html} />
          )}
        </section>
      )}
    </div>
  )
}

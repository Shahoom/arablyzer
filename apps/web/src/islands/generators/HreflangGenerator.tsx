import { hreflangTags, type HreflangResult } from '@arablyzer/generators'
import { GENERATORS_UI } from '@arablyzer/i18n/generators'
import type { Lang } from '@arablyzer/seo/site'
import { Plus, TriangleAlert } from 'lucide-preact'
import type { TargetedSubmitEvent } from 'preact'
import { useState } from 'preact/hooks'
import { ScanNote } from '../ScanNote'
import { FIELD, LABEL, SECONDARY, SUBMIT, ToolBox } from '../ToolBox'
import { CopyBox } from './CopyBox'

/** The hreflang generator (M2.3b): the same set of tags for every version of a page. */
export default function HreflangGenerator({
  lang,
  tool,
  title,
  dot,
}: {
  lang: Lang
  tool: string
  title: string
  dot: string
}) {
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
    <div className="flex flex-col gap-4" data-tool={tool}>
      <ToolBox
        title={title}
        dot={dot}
        note={<ScanNote lang={lang} id="generator-note" line={common.local} keep={[]} />}
      >
        <form onSubmit={onSubmit} data-tool-kind="generator" className="flex flex-col gap-4">
          {rows.map((row, index) => (
            <fieldset
              key={row}
              className="m-0 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 border-0 p-0 sm:grid-cols-[minmax(0,3fr)_minmax(0,1fr)_auto]"
            >
              <div className="col-span-2 flex flex-col gap-2 sm:col-span-1">
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
              {/* On a phone the code and the button share a line under the address. */}
              <div
                className={`flex flex-col gap-2 ${rows.length > 1 ? '' : 'col-span-2 sm:col-span-1'}`}
              >
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
                  className={SECONDARY}
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
            className={`${SECONDARY} self-start`}
          >
            <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
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
            <p id="x-default-hint" className="m-0 text-meta text-ink-2">
              {t.xDefaultHint}
            </p>
          </div>
          <button type="submit" className={SUBMIT}>
            {t.submit}
          </button>
        </form>
      </ToolBox>
      {result !== null && (
        <section aria-label={common.result} className="flex flex-col gap-3">
          {result.tags.problems.map((problem) => (
            <p
              key={problem.row}
              role="alert"
              className="m-0 flex items-start gap-2 rounded-xl bg-serious-soft px-card py-3 text-small text-serious"
            >
              <TriangleAlert
                size={16}
                strokeWidth={2.2}
                aria-hidden="true"
                className="mt-0.5 shrink-0"
              />
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

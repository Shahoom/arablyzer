import { whatsAppLink, type WhatsAppResult } from '@arablyzer/generators'
import { GENERATORS_UI } from '@arablyzer/i18n/generators'
import type { Lang } from '@arablyzer/seo/site'
import type { TargetedSubmitEvent } from 'preact'
import { Info } from 'lucide-preact'
import { useState } from 'preact/hooks'
import { AREA, FIELD, LABEL, SUBMIT, ToolBox } from '../ToolBox'
import { CopyBox } from './CopyBox'

/** The WhatsApp link generator (M2.3b): in the browser, the link the rule accepts. */
export default function WhatsAppGenerator({
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
  const t = GENERATORS_UI[lang].whatsapp
  const common = GENERATORS_UI[lang].common
  const [result, setResult] = useState<WhatsAppResult | null>(null)
  const onSubmit = (event: TargetedSubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const value = (name: string) => {
      const entry = data.get(name)
      return typeof entry === 'string' ? entry : ''
    }
    setResult(
      whatsAppLink({
        number: value('number'),
        country: value('country'),
        text: value('text'),
        label: value('label').trim() === '' ? t.labelDefault : value('label'),
      }),
    )
  }
  return (
    <div className="flex flex-col gap-5" data-tool={tool}>
      <ToolBox lang={lang} title={title} dot={dot}>
        <form onSubmit={onSubmit} data-tool-kind="generator" className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div className="flex flex-col gap-2">
              <label htmlFor="wa-country" className={LABEL}>
                {t.country}
              </label>
              <select id="wa-country" name="country" className={FIELD}>
                {Object.entries(t.countries).map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
                <option value="">{t.international}</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="wa-number" className={LABEL}>
                {t.number}
              </label>
              <input
                id="wa-number"
                name="number"
                type="tel"
                dir="ltr"
                required
                autoComplete="tel"
                placeholder="9123 4567"
                className={`${FIELD} font-mono`}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="wa-text" className={LABEL}>
              {t.text}
            </label>
            <textarea
              id="wa-text"
              name="text"
              rows={2}
              dir="auto"
              aria-describedby="wa-text-hint"
              className={AREA}
            />
            <p id="wa-text-hint" className="m-0 text-sm text-ink-3">
              {t.textHint}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="wa-label" className={LABEL}>
              {t.label}
            </label>
            {/* Free text in either language: its direction follows what is typed. */}
            <input
              id="wa-label"
              name="label"
              type="text"
              dir="auto"
              placeholder={t.labelDefault}
              className={FIELD}
            />
          </div>
          <button type="submit" className={SUBMIT}>
            {t.submit}
          </button>
        </form>
      </ToolBox>
      <p className="m-0 px-1 text-center text-sm text-ink-3">{common.local}</p>
      {result !== null && (
        <section
          aria-label={common.result}
          className={`flex flex-col gap-3 rounded-2xl p-3 sm:p-4 ${result.ok ? 'bg-linear-to-br from-pass-soft to-indigo-soft' : 'bg-serious-soft'}`}
        >
          {result.ok ? (
            <>
              {result.fixed !== null && (
                <p className="m-0 flex items-start gap-2 px-1 text-sm text-ink-2">
                  <Info
                    size={16}
                    strokeWidth={2.2}
                    aria-hidden="true"
                    className="mt-0.5 shrink-0"
                  />
                  {t.problems[result.fixed]}
                </p>
              )}
              <CopyBox lang={lang} label={t.link} text={result.url} />
              <CopyBox lang={lang} label={t.html} text={result.html} />
              <a
                href={result.url}
                target="_blank"
                rel="noopener"
                className="btn-white self-start text-sm"
              >
                {t.open}
              </a>
            </>
          ) : (
            <p role="alert" className="m-0 px-1 text-sm text-serious">
              {t.problems[result.problem]}
            </p>
          )}
        </section>
      )}
    </div>
  )
}

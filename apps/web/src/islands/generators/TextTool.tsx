import { GENERATORS_UI } from '@arablyzer/i18n/generators'
import type { Lang } from '@arablyzer/seo/site'
import { Check, Info, TriangleAlert, X } from 'lucide-preact'
import type { TargetedSubmitEvent } from 'preact'
import { useState } from 'preact/hooks'
import { ScanNote } from '../ScanNote'
import { AREA, FIELD, LABEL, SUBMIT, ToolBox } from '../ToolBox'
import { CopyBox } from './CopyBox'
import { TEXT_TOOLS } from './text-tools'
import type { Block, TextField, TextToolResult, Tone } from './text-tools/spec'

const TONE: Readonly<Record<Tone, { readonly icon: typeof Check; readonly style: string }>> = {
  ok: { icon: Check, style: 'text-pass' },
  warn: { icon: TriangleAlert, style: 'text-moderate' },
  bad: { icon: X, style: 'text-serious' },
  info: { icon: Info, style: 'text-ink-2' },
}

function Field({ field }: { field: TextField }) {
  const id = `field-${field.name}`
  const mono = field.dir === 'ltr' ? ' font-mono' : ''
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={LABEL}>
        {field.label}
      </label>
      {field.kind === 'textarea' ? (
        <textarea
          id={id}
          name={field.name}
          rows={field.rows ?? 4}
          dir={field.dir ?? 'auto'}
          required={field.required ?? true}
          spellcheck={false}
          autoComplete="off"
          placeholder={field.placeholder}
          aria-describedby={field.hint === undefined ? undefined : `${id}-hint`}
          className={`${AREA}${mono}`}
        />
      ) : field.kind === 'select' ? (
        <select id={id} name={field.name} dir={field.dir ?? 'auto'} className={`${FIELD}${mono}`}>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          name={field.name}
          type="text"
          dir={field.dir ?? 'auto'}
          required={field.required ?? true}
          autoComplete="off"
          placeholder={field.placeholder}
          aria-describedby={field.hint === undefined ? undefined : `${id}-hint`}
          className={`${FIELD}${mono}`}
        />
      )}
      {field.hint !== undefined && (
        <p id={`${id}-hint`} className="m-0 text-meta text-ink-2">
          {field.hint}
        </p>
      )}
    </div>
  )
}

function Notes({ block }: { block: Extract<Block, { kind: 'notes' }> }) {
  return (
    <div className="card flex flex-col gap-3 p-card">
      {block.label !== undefined && <p className="heading-3 m-0">{block.label}</p>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {block.items.map((item) => {
          const { icon: Icon, style } = TONE[item.tone]
          return (
            <li key={item.text} className={`flex items-start gap-2 text-small ${style}`}>
              <Icon size={16} strokeWidth={2.2} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span className="min-w-0 text-ink [overflow-wrap:anywhere]">{item.text}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * The generators and paste tools made of a form and an answer (M10.1): the form is the tool's
 * spec (text-tools/), the answer code to copy, notes and lines. It runs in the visitor's browser:
 * nothing typed leaves it.
 */
export default function TextTool({
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
  const spec = TEXT_TOOLS[tool]
  const common = GENERATORS_UI[lang].common
  const [result, setResult] = useState<TextToolResult | null>(null)
  if (spec === undefined) return null
  const onSubmit = (event: TargetedSubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const values: Record<string, string> = {}
    for (const field of spec.fields(lang)) {
      const entry = data.get(field.name)
      values[field.name] = typeof entry === 'string' ? entry : ''
    }
    setResult(spec.run(values, lang))
  }
  return (
    <div className="flex flex-col gap-4" data-tool={tool}>
      <ToolBox
        title={title}
        dot={dot}
        note={<ScanNote lang={lang} id="generator-note" line={common.local} keep={[]} />}
      >
        <form onSubmit={onSubmit} data-tool-kind={spec.kind} className="flex flex-col gap-4">
          {spec.fields(lang).map((field) => (
            <Field key={field.name} field={field} />
          ))}
          <button type="submit" className={SUBMIT}>
            {spec.submit(lang)}
          </button>
        </form>
      </ToolBox>
      {result !== null && (
        <section aria-label={common.result} className="flex flex-col gap-3">
          {'error' in result ? (
            <p
              role="alert"
              className="m-0 rounded-xl bg-serious-soft px-card py-3 text-small text-serious"
            >
              {result.error}
            </p>
          ) : (
            result.blocks.map((block, index) =>
              block.kind === 'code' ? (
                <CopyBox key={index} lang={lang} label={block.label} text={block.text} />
              ) : block.kind === 'notes' ? (
                <Notes key={index} block={block} />
              ) : block.kind === 'link' ? (
                <a key={index} href={block.href} className="btn-white self-start">
                  {block.text}
                </a>
              ) : (
                <div key={index} className="card flex flex-col gap-1 p-card">
                  {block.label !== undefined && (
                    <p className="m-0 text-small font-semibold text-ink-2">{block.label}</p>
                  )}
                  <p className="m-0 text-body text-ink [overflow-wrap:anywhere]">{block.text}</p>
                </div>
              ),
            )
          )}
        </section>
      )}
    </div>
  )
}

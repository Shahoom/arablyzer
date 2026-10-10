import type { BrandSettings } from '@arablyzer/api-contract/codes'
import { MAX_BRAND_NAME } from '@arablyzer/api-contract/codes'
import { PDF_UI } from '@arablyzer/i18n/pdf'
import { brandColorOf, DEFAULT_BRAND_COLOR } from '@arablyzer/pdf/contrast'
import type { Lang } from '@arablyzer/seo/site'
import { ImagePlus, Palette, Trash2 } from 'lucide-preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { getBrand, removeLogo, saveBrand, uploadLogo } from '../pdf-api'
import { logoHref, type PdfProblem } from '../pdf-model'

type Loaded =
  | { readonly kind: 'loading' }
  | { readonly kind: 'off' }
  | { readonly kind: 'ready'; readonly settings: BrandSettings }

/** The mark as it will look: the colour set through the style object (the policy has no inline style), never an attribute. */
function Mark({
  lang,
  name,
  color,
  logo,
  credit,
}: {
  lang: Lang
  name: string
  color: string
  logo: string | null
  credit: boolean
}) {
  const t = PDF_UI[lang].ui.brand
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    box.current?.style.setProperty('--brand', color)
  }, [color])
  return (
    <div
      ref={box}
      className="flex flex-wrap items-center gap-3 rounded-xl [--brand:#3730a3] bg-(--brand) p-4 text-white forced-colors:border"
    >
      {logo !== null && (
        <img
          src={logo}
          alt={t.logoAlt(name)}
          className="h-10 max-w-[10rem] rounded-lg bg-white object-contain p-1"
        />
      )}
      <span className="text-body font-bold">{name === '' ? t.previewEmpty : name}</span>
      {credit && <span className="ms-auto text-meta opacity-90">{t.credit}</span>}
    </div>
  )
}

/**
 * White-label on the account page (M4.7): the company's name, colour and logo, which replace
 * Arablyzer's mark on the account's PDFs and shared reports. A plan without it sees why the form is
 * not there. The colour is checked for white text on it, as the PDF will check it.
 */
export default function BrandPanel({ lang }: { lang: Lang }) {
  const t = PDF_UI[lang].ui.brand
  const [view, setView] = useState<Loaded>({ kind: 'loading' })
  const [name, setName] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const adopt = (settings: BrandSettings) => {
    setView({ kind: 'ready', settings })
    setName(settings.name)
    setColor(settings.color)
  }
  useEffect(() => {
    let live = true
    void getBrand().then((read) => {
      if (!live) return
      if (read.ok) adopt(read.value)
      else setView({ kind: 'off' })
    })
    return () => {
      live = false
    }
  }, [])

  if (view.kind === 'off') return null
  if (view.kind === 'loading') {
    return (
      <section className="card flex flex-col gap-4 rounded-card p-card" aria-busy="true">
        <h2 className="heading-2 m-0">{t.title}</h2>
        <p role="status" className="m-0 text-small text-ink-2">
          {t.loading}
        </p>
      </section>
    )
  }
  const { settings } = view
  if (!settings.available) {
    return (
      <section
        aria-labelledby="brand-title"
        className="card flex flex-col gap-3 rounded-card p-card"
      >
        <h2 id="brand-title" className="heading-2 m-0">
          {t.title}
        </h2>
        <p className="m-0 text-body text-ink-2">{t.notIncluded}</p>
      </section>
    )
  }

  const guarded = brandColorOf(color)
  const wordFor = (problem: PdfProblem, logo: string | undefined): string =>
    logo !== undefined && logo in t.logoProblems
      ? t.logoProblems[logo as keyof typeof t.logoProblems]
      : PDF_UI[lang].ui.problems[problem]

  async function save() {
    if (busy) return
    setBusy(true)
    setMessage(null)
    const saved = await saveBrand({ name, color })
    setBusy(false)
    if (saved.ok) {
      adopt(saved.value)
      setMessage({ ok: true, text: t.saved })
    } else setMessage({ ok: false, text: wordFor(saved.problem, saved.logo) })
  }

  async function pick(files: FileList | null) {
    const chosen = files?.[0]
    if (chosen === undefined || busy) return
    setBusy(true)
    setMessage(null)
    const sent = await uploadLogo(chosen)
    setBusy(false)
    if (file.current !== null) file.current.value = ''
    if (sent.ok) {
      setView({ kind: 'ready', settings: sent.value })
      setMessage({ ok: true, text: t.saved })
    } else setMessage({ ok: false, text: wordFor(sent.problem, sent.logo ?? 'unavailable') })
  }

  async function dropLogo() {
    if (busy) return
    setBusy(true)
    const gone = await removeLogo()
    setBusy(false)
    if (gone.ok) setView({ kind: 'ready', settings: gone.value })
    else setMessage({ ok: false, text: t.failed })
  }

  return (
    <section aria-labelledby="brand-title" className="card flex flex-col gap-5 rounded-card p-card">
      <h2 id="brand-title" className="heading-2 m-0">
        {t.title}
      </h2>
      <p className="m-0 text-small text-ink-2">{t.lead}</p>
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="brand-name" className="text-small font-semibold text-ink">
            {t.name}
          </label>
          <input
            id="brand-name"
            type="text"
            value={name}
            maxLength={MAX_BRAND_NAME}
            autoComplete="organization"
            aria-describedby="brand-name-hint"
            onInput={(event) => {
              setName(event.currentTarget.value)
            }}
            className="min-h-11 rounded-xl border border-line bg-surface px-3 text-body text-ink"
          />
          <p id="brand-name-hint" className="m-0 text-meta text-ink-2">
            {t.nameHint}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="brand-color" className="text-small font-semibold text-ink">
            {t.color}
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              id="brand-color"
              type="color"
              value={color ?? DEFAULT_BRAND_COLOR}
              aria-describedby="brand-color-hint"
              onInput={(event) => {
                setColor(event.currentTarget.value)
              }}
              className="h-11 w-16 cursor-pointer rounded-xl border border-line bg-surface p-1"
            />
            <span dir="ltr" className="text-small text-ink-2">
              {color ?? DEFAULT_BRAND_COLOR}
            </span>
            <button
              type="button"
              className="btn-white"
              disabled={color === null}
              onClick={() => {
                setColor(null)
              }}
            >
              <Palette size={16} aria-hidden="true" />
              {t.noColor}
            </button>
          </div>
          <p id="brand-color-hint" className="m-0 text-meta text-ink-2">
            {t.colorHint}
          </p>
          {guarded.fallback && (
            <p role="status" className="m-0 text-small text-ink-2">
              {t.colorFallback}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-small font-semibold text-ink">{t.logo}</span>
          {settings.hasLogo ? (
            <img
              src={logoHref(settings.updatedAt)}
              alt={t.logoAlt(settings.name)}
              className="h-14 max-w-[12rem] self-start rounded-xl border border-line bg-white object-contain p-1"
            />
          ) : (
            <p className="m-0 text-small text-ink-2">{t.logoNone}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-white"
              disabled={busy}
              onClick={() => file.current?.click()}
            >
              <ImagePlus size={16} aria-hidden="true" />
              {t.logoChoose}
            </button>
            {settings.hasLogo && (
              <button
                type="button"
                className="btn-white"
                disabled={busy}
                onClick={() => void dropLogo()}
              >
                <Trash2 size={16} aria-hidden="true" />
                {t.logoRemove}
              </button>
            )}
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label={t.logo}
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => void pick(event.currentTarget.files)}
            />
          </div>
          <p className="m-0 text-meta text-ink-2">{t.logoHint}</p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-small font-semibold text-ink">{t.preview}</span>
          <Mark
            lang={lang}
            name={name.trim()}
            color={guarded.color}
            logo={settings.hasLogo ? logoHref(settings.updatedAt) : null}
            credit={settings.credit}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-grad" disabled={busy}>
            {busy ? t.saving : t.save}
          </button>
          {message !== null && (
            <p role={message.ok ? 'status' : 'alert'} className="m-0 text-small text-ink-2">
              {message.text}
            </p>
          )}
        </div>
      </form>
    </section>
  )
}

import { fontSubsetPath } from '@arablyzer/api-contract/codes'
import { NATIVE } from '@arablyzer/i18n/native'
import type { ArabicFontsFact, Report } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'
import { Download } from 'lucide-preact'
import { useState } from 'preact/hooks'
import { fetchFontSubset } from '../api'

type Font = ArabicFontsFact['fonts'][number]

const kb = (bytes: number): string => `${Math.max(1, Math.round(bytes / 1024))} KB`

/** The rule's `@font-face` for the subset, for the file name the visitor will give it. */
export function fontFaceSnippet(font: Font): string {
  const file = `${font.family
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}-subset.woff2`
  return [
    '@font-face {',
    `  font-family: '${font.family.replaceAll("'", "\\'")}';`,
    `  src: url('/fonts/${file}') format('woff2');`,
    ...(font.weight === null ? [] : [`  font-weight: ${font.weight};`]),
    ...(font.style === null ? [] : [`  font-style: ${font.style};`]),
    '  font-display: swap;',
    ...(font.unicodeRange === null ? [] : [`  unicode-range: ${font.unicodeRange};`]),
    '}',
  ].join('\n')
}

type State = 'idle' | 'pending' | 'failed' | 'limited'

/** One font: its sizes, the download (made on request) and the rule. */
function FontRow({ font, id, lang }: { font: Font; id: string; lang: Lang }) {
  const t = NATIVE[lang].fonts
  const [state, setState] = useState<State>('idle')
  const subset = font.subsetBytes
  const download = async (event: Event) => {
    event.preventDefault()
    setState('pending')
    const made = await fetchFontSubset(id, font.url)
    if (!made.ok) {
      setState(made.reason)
      return
    }
    const link = document.createElement('a')
    link.href = URL.createObjectURL(made.blob)
    link.download = `${font.family.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-subset.woff2`
    link.click()
    URL.revokeObjectURL(link.href)
    setState('idle')
  }
  return (
    <li className="flex flex-col gap-3 border-t border-line py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 dir="ltr" className="heading-3 m-0">
          {font.family}
        </h3>
        <span dir="ltr" className="font-mono text-meta break-all text-ink-3">
          {font.url.split(/[?#]/)[0]?.split('/').pop()} <span className="ms-2">{font.format}</span>
        </span>
      </div>
      {subset === null ? (
        <p className="m-0 text-small text-ink-2">{t.unused}</p>
      ) : (
        <>
          <dl className="m-0 flex flex-wrap gap-x-8 gap-y-2 text-small">
            <div>
              <dt className="text-meta text-ink-3">{t.now}</dt>
              <dd dir="ltr" className="m-0 font-semibold tabular-nums">
                {kb(font.bytes)}
              </dd>
            </div>
            <div>
              <dt className="text-meta text-ink-3">{t.subset}</dt>
              <dd dir="ltr" className="m-0 font-semibold tabular-nums">
                {kb(subset)}
              </dd>
            </div>
            <div>
              <dt className="text-meta text-ink-3">&nbsp;</dt>
              <dd className="m-0 font-semibold text-pass">
                {t.saves(
                  kb(Math.max(0, font.bytes - subset)),
                  Math.max(0, Math.round(((font.bytes - subset) / font.bytes) * 100)),
                )}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={fontSubsetPath(id, font.url)}
              onClick={(event) => void download(event)}
              aria-disabled={state === 'pending'}
              className="btn-grad inline-flex min-h-11 items-center gap-2 aria-disabled:cursor-wait"
            >
              <Download size={16} aria-hidden="true" />
              {state === 'pending' ? t.pending : t.download}
            </a>
            <span className="text-meta text-ink-2" role="status">
              {state === 'failed' ? t.failed : state === 'limited' ? t.limited : t.downloadHint}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-meta text-ink-3">{t.snippet}</span>
            <pre
              dir="ltr"
              className="m-0 overflow-x-auto rounded-card bg-surface-2 p-3 text-start font-mono text-meta"
            >
              <code>{fontFaceSnippet(font)}</code>
            </pre>
          </div>
        </>
      )}
    </li>
  )
}

/**
 * The font slimmer's panel on a tool page or a report: each Arabic web font with its subset's
 * size, a download made on request, and the `@font-face` rule with its `unicode-range`. Nothing
 * when the report holds no such fonts and the tool did not ask for them (arabicFonts is absent).
 */
export function FontSlimmer({ report, id, lang }: { report: Report; id: string; lang: Lang }) {
  const t = NATIVE[lang].fonts
  const fonts = report.facts.arabicFonts?.fonts
  if (!report.rules.some((rule) => rule.id === 'ar-font-subset-savings')) return null
  return (
    <section
      aria-labelledby="fonts-title"
      className="flex flex-col gap-3 border-b border-line p-card"
    >
      <h3 id="fonts-title" className="heading-3 m-0">
        {t.title}
      </h3>
      {fonts === undefined || fonts.length === 0 ? (
        <p className="m-0 text-small text-ink-2">{t.none}</p>
      ) : (
        <>
          <p className="m-0 text-small text-ink-2">{t.intro}</p>
          <ul className="m-0 flex list-none flex-col p-0">
            {fonts.map((font) => (
              <FontRow key={font.url} font={font} id={id} lang={lang} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

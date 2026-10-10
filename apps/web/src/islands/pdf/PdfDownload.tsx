import type { PdfSummary } from '@arablyzer/api-contract/codes'
import { PDF_UI } from '@arablyzer/i18n/pdf'
import type { Lang } from '@arablyzer/seo/site'
import { PUBLIC_AUTH_GOOGLE_CLIENT_ID } from 'astro:env/client'
import { Download, FileDown, LoaderCircle, TriangleAlert } from 'lucide-preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { readAccount } from '../auth-api'
import { askPdf, getPdf } from '../pdf-api'
import {
  isMaking,
  PDF_POLL_MS,
  PDF_WAIT_MS,
  pdfFileHref,
  type PdfAsk,
  type PdfProblem,
} from '../pdf-model'

interface Props {
  lang: Lang
  /** What the PDF is of. */
  ask: PdfAsk
  /** The report in words, for the button's name: «the report of example.com». */
  what: string
  /** Look first whether a person is signed in, and show nothing if not (the shared report page). */
  gate?: boolean
  className?: string
}

type State =
  | { readonly kind: 'idle' }
  | { readonly kind: 'asking' }
  | { readonly kind: 'making'; readonly pdf: PdfSummary }
  | { readonly kind: 'ready'; readonly pdf: PdfSummary }
  | { readonly kind: 'failed'; readonly text: string }

/**
 * «Download PDF» (M4.7): asks for the PDF of a report, waits for it (the API only queues it; the PDF
 * job draws it in the scanner's browser), and offers the file. Shown to a signed-in person only,
 * and not at all with accounts off.
 */
export default function PdfDownload({ lang, ask, what, gate = false, className }: Props) {
  const t = PDF_UI[lang].ui
  const accountsOn = (PUBLIC_AUTH_GOOGLE_CLIENT_ID ?? '') !== ''
  const [shown, setShown] = useState(!gate)
  const [state, setState] = useState<State>({ kind: 'idle' })
  const live = useRef(true)
  // A function, not the ref read inline: the ref changes while an await is pending, which a flow check cannot see.
  const gone = () => !live.current

  useEffect(() => {
    live.current = true
    if (gate && accountsOn) {
      void readAccount().then((read) => {
        if (live.current) setShown(read.ok && read.value !== null)
      })
    }
    return () => {
      live.current = false
    }
  }, [gate, accountsOn])

  const problem = (p: PdfProblem): State => ({ kind: 'failed', text: t.problems[p] })

  async function watch(first: PdfSummary) {
    const started = Date.now()
    let pdf = first
    while (!gone() && isMaking(pdf)) {
      if (Date.now() - started > PDF_WAIT_MS) {
        setState({ kind: 'failed', text: t.failed.timeout })
        return
      }
      await new Promise((resolve) => setTimeout(resolve, PDF_POLL_MS))
      if (gone()) return
      const next = await getPdf(pdf.id)
      if (!next.ok) {
        setState(problem(next.problem))
        return
      }
      pdf = next.value
    }
    if (gone()) return
    if (pdf.state === 'done') setState({ kind: 'ready', pdf })
    else
      setState({
        kind: 'failed',
        text: pdf.error === null ? t.failed.internal : t.failed[pdf.error],
      })
  }

  async function click() {
    if (state.kind === 'asking' || state.kind === 'making') return
    setState({ kind: 'asking' })
    const asked = await askPdf(ask, lang)
    if (!live.current) return
    if (!asked.ok) {
      setState(problem(asked.problem))
      return
    }
    setState({ kind: 'making', pdf: asked.value })
    await watch(asked.value)
  }

  if (!accountsOn || !shown) return null
  const box = className ?? 'flex flex-col gap-2'
  return (
    <div className={box}>
      {(state.kind === 'idle' || state.kind === 'failed') && (
        <button
          type="button"
          className="btn-white"
          aria-label={t.buttonLabel(what)}
          onClick={() => void click()}
        >
          <FileDown size={16} aria-hidden="true" />
          {t.button}
        </button>
      )}
      {state.kind === 'ready' && (
        <div className="flex flex-wrap gap-2">
          <a href={pdfFileHref(state.pdf.id)} download className="btn-grad">
            <Download size={16} aria-hidden="true" />
            {t.download}
          </a>
          <button type="button" className="btn-white" onClick={() => void click()}>
            {t.again}
          </button>
        </div>
      )}
      {(state.kind === 'asking' || state.kind === 'making') && (
        <p role="status" className="m-0 flex items-start gap-2 text-small text-ink-2">
          <LoaderCircle
            aria-hidden="true"
            size={16}
            className="mt-1 shrink-0 animate-spin motion-reduce:animate-none"
          />
          {t.preparing}
        </p>
      )}
      {state.kind === 'ready' && (
        <p role="status" className="m-0 text-meta text-ink-2">
          {t.ready}
        </p>
      )}
      {state.kind === 'failed' && (
        <p role="alert" className="m-0 flex items-start gap-2 text-small text-ink-2">
          <TriangleAlert aria-hidden="true" size={16} className="mt-1 shrink-0 text-moderate" />
          {state.text}
        </p>
      )}
    </div>
  )
}

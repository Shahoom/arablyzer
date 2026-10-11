import type { PdfsResponse, PdfSummary } from '@arablyzer/api-contract/codes'
import { PDF_UI } from '@arablyzer/i18n/pdf'
import type { Lang } from '@arablyzer/seo/site'
import { Download, FileText, Trash2 } from 'lucide-preact'
import { useEffect, useState } from 'preact/hooks'
import { deletePdf, listPdfs } from '../pdf-api'
import { isMaking, pdfFileHref, PDF_POLL_MS } from '../pdf-model'
import { dayLabel } from '../sites-model'

/**
 * The PDFs the account made (M4.7): which, when, how big, a link to the file, and a way to delete it,
 * with the month's allowance. A file being made is looked at again until it is done.
 */
export default function PdfPanel({ lang }: { lang: Lang }) {
  const t = PDF_UI[lang].ui
  const [data, setData] = useState<PdfsResponse | null | 'failed'>(null)

  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const look = async () => {
      const read = await listPdfs()
      if (!live) return
      if (!read.ok) {
        setData('failed')
        return
      }
      setData(read.value)
      if (read.value.pdfs.some(isMaking)) timer = setTimeout(() => void look(), PDF_POLL_MS * 2)
    }
    void look()
    return () => {
      live = false
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [])

  async function remove(pdf: PdfSummary) {
    const gone = await deletePdf(pdf.id)
    if (gone.ok) {
      setData((now) =>
        now === null || now === 'failed'
          ? now
          : { ...now, pdfs: now.pdfs.filter((other) => other.id !== pdf.id) },
      )
    }
  }

  if (data === null || data === 'failed') return null
  return (
    <section aria-labelledby="pdfs-title" className="card flex flex-col gap-4 rounded-card p-card">
      <h2 id="pdfs-title" className="heading-2 m-0">
        {t.listTitle}
      </h2>
      <p className="m-0 text-small text-ink-2">{t.listLead}</p>
      <p className="m-0 text-small font-semibold text-ink">
        {t.allowance(data.allowance.used, data.allowance.perMonth)}
      </p>
      {data.pdfs.length === 0 ? (
        <p className="m-0 text-body text-ink-2">{t.listEmpty}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {data.pdfs.map((pdf) => (
            <li
              key={pdf.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3"
            >
              <FileText aria-hidden="true" size={16} className="shrink-0 text-ink-3" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-body font-semibold text-ink">{t.kinds[pdf.kind]}</span>
                <span className="meta-row text-meta text-ink-2">
                  <span>{dayLabel(pdf.createdAt, lang)}</span>
                  {pdf.bytes !== null && (
                    <span>{t.size(Math.max(1, Math.round(pdf.bytes / 1024)))}</span>
                  )}
                  {pdf.state === 'expired' && <span>{t.expired}</span>}
                  {pdf.state === 'failed' && pdf.error !== null && (
                    <span>{t.failed[pdf.error]}</span>
                  )}
                  {isMaking(pdf) && <span>{t.preparing}</span>}
                </span>
              </div>
              {pdf.state === 'done' && (
                <a href={pdfFileHref(pdf.id)} download className="btn-white">
                  <Download size={16} aria-hidden="true" />
                  {t.download}
                </a>
              )}
              {!isMaking(pdf) && (
                <button
                  type="button"
                  className="btn-white"
                  aria-label={`${PDF_UI[lang].ui.brand.logoRemove}: ${t.kinds[pdf.kind]} ${dayLabel(pdf.createdAt, lang)}`}
                  onClick={() => void remove(pdf)}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

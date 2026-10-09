import type { SiteSummary } from '@arablyzer/api-contract/codes'
import { CRAWL_UI } from '@arablyzer/i18n/crawl'
import type { Lang } from '@arablyzer/seo/site'
import { Layers } from 'lucide-preact'
import { isActive } from '../crawl-model'

interface Props {
  lang: Lang
  site: SiteSummary
  /** The most pages a crawl checks on this plan: the API's number. */
  cap: number
  /** Another request is under way: nothing else is sent. */
  busy: boolean
  /** This site's own request is the one under way. */
  working: boolean
  /** The report of this site's crawl is open. */
  open: boolean
  onStart: (site: SiteSummary) => void
  onCancel: (site: SiteSummary) => void
  onToggle: (site: SiteSummary) => void
}

/**
 * One saved site's deep crawl (M4.5): what its last crawl came to or how far it has got, and the
 * buttons to start one, stop it, and open its report. The numbers are the API's.
 */
export default function CrawlRow({
  lang,
  site,
  cap,
  busy,
  working,
  open,
  onStart,
  onCancel,
  onToggle,
}: Props) {
  const r = CRAWL_UI[lang].row
  const { crawl } = site
  const going = crawl !== null && isActive(crawl.state)
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="m-0 flex items-start gap-2 text-small text-ink-2">
          <Layers aria-hidden="true" size={16} className="mt-1 shrink-0 text-ink-3" />
          <span className="min-w-0">
            {crawl === null ? (
              r.none
            ) : (
              <>
                {r.states[crawl.state]}
                {crawl.state === 'running' && ` · ${r.progress(crawl.pagesChecked, crawl.pageCap)}`}
                {crawl.state === 'rendering' &&
                  ` · ${r.browsers(crawl.rendered.done, crawl.rendered.total)}`}
                {crawl.state === 'done' && ` · ${r.summary(crawl.pagesChecked, crawl.templates)}`}
                {crawl.state === 'failed' && crawl.error !== null && ` · ${r.failed[crawl.error]}`}
              </>
            )}
          </span>
        </p>
        <p className="m-0 text-meta text-ink-2">{r.cap(cap)}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {crawl !== null && crawl.state !== 'queued' && crawl.templates > 0 && (
          <button
            type="button"
            className="btn-white"
            aria-expanded={open}
            disabled={busy}
            onClick={() => {
              onToggle(site)
            }}
          >
            {open ? r.close : r.open}
          </button>
        )}
        {going ? (
          <button
            type="button"
            className="btn-ghost"
            disabled={busy}
            onClick={() => {
              onCancel(site)
            }}
          >
            {working ? r.cancelling : r.cancel}
          </button>
        ) : (
          <button
            type="button"
            className="btn-white"
            disabled={busy}
            onClick={() => {
              onStart(site)
            }}
          >
            {working ? r.starting : r.start}
          </button>
        )}
      </div>
    </div>
  )
}

import { APP_UI } from '@arablyzer/i18n/app'
import { useState } from 'preact/hooks'
import CrawlReportCard from '../../account/CrawlReportCard'
import CrawlRow from '../../account/CrawlRow'
import type { ViewProps } from '../AppFrame'
import { useSiteActions } from '../actions'
import { appHref, siteHref } from '../app-model'
import { useShared } from '../data'
import { EmptyBlock, Notice, PageHeader, SiteTile, Skeleton } from '../ui'

/** Each saved site's deep crawl: start one, watch it, open its report of templates and issues. */
export default function CrawlsView({ lang }: ViewProps) {
  const t = APP_UI[lang]
  const c = t.crawls
  const shared = useShared()
  const actions = useSiteActions(lang)
  const [open, setOpen] = useState<string | null>(null)

  return (
    <>
      <PageHeader title={t.pages.crawls.title} lead={t.pages.crawls.lead}>
        {shared.status === 'ready' && shared.sites.length > 0 && (
          <p className="m-0 text-small text-ink-2">{c.cap(shared.limits.crawlPages)}</p>
        )}
      </PageHeader>
      {actions.message !== null && (
        <div className="mb-4">
          <Notice text={actions.message} />
        </div>
      )}
      {shared.status === 'loading' && <Skeleton rows={3} />}
      {shared.status === 'failed' && (
        <Notice text={t.common.failed} retry={shared.reload} action={t.common.retry} />
      )}
      {shared.status === 'ready' && shared.sites.length === 0 && (
        <EmptyBlock title={c.emptyTitle} text={c.emptyText}>
          <a className="btn-grad" href={appHref(lang, 'sites')}>
            {t.empty.addSite}
          </a>
        </EmptyBlock>
      )}
      {shared.status === 'ready' && shared.sites.length > 0 && (
        <div className="flex flex-col gap-6">
          <ul className="app-surface m-0 list-none p-0">
            {shared.rows.map((row) => (
              <li
                key={row.site.id}
                className="flex flex-col gap-3 border-t border-line p-5 first:border-t-0"
              >
                <div className="flex items-center gap-3">
                  <SiteTile url={row.site.url} />
                  <a
                    href={siteHref(lang, row.site.id)}
                    dir="ltr"
                    className="truncate text-body font-semibold text-ink hover:underline rtl:text-right"
                  >
                    {row.host}
                  </a>
                </div>
                <CrawlRow
                  lang={lang}
                  site={row.site}
                  cap={shared.limits.crawlPages}
                  busy={actions.busy !== null}
                  working={actions.busy === `crawl:${row.site.id}`}
                  open={row.site.crawl !== null && open === row.site.crawl.id}
                  onStart={(target) => void actions.startCrawl(target)}
                  onCancel={(target) => void actions.cancelCrawl(target)}
                  onToggle={(target) => {
                    const id = target.crawl?.id ?? null
                    setOpen(open === id ? null : id)
                  }}
                />
              </li>
            ))}
          </ul>
          {open !== null && (
            <CrawlReportCard
              key={open}
              lang={lang}
              crawlId={open}
              onSummary={(summary) => {
                const owner = shared.sites.find((site) => site.crawl?.id === summary.id)
                if (owner !== undefined) actions.setCrawl(owner.id, summary)
              }}
              onClose={() => {
                setOpen(null)
              }}
              onRemoved={(id) => {
                setOpen(null)
                const owner = shared.sites.find((site) => site.crawl?.id === id)
                if (owner !== undefined) actions.setCrawl(owner.id, null)
              }}
            />
          )}
        </div>
      )}
    </>
  )
}

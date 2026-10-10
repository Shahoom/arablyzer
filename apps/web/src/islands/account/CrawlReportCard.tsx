import type {
  CrawlIssue,
  CrawlPage,
  CrawlReport,
  CrawlSummary,
  CrawlTemplate,
} from '@arablyzer/api-contract/codes'
import { ACCOUNT_UI } from '@arablyzer/i18n/account'
import { COMPARE_UI } from '@arablyzer/i18n/compare'
import { CRAWL_UI } from '@arablyzer/i18n/crawl'
import type { Lang } from '@arablyzer/seo/site'
import { ExternalLink, Layers, Trash2, TriangleAlert, X } from 'lucide-preact'
import { useEffect, useState } from 'preact/hooks'
import { listCrawls } from '../compare-api'
import { compareHref } from '../compare-model'
import PdfDownload from '../pdf/PdfDownload'
import { cancelCrawl, deleteCrawl, getCrawl, getCrawlPages } from '../crawl-api'
import {
  ISSUES_SHOWN,
  isActive,
  issueTitle,
  POLL_MS,
  templateLabel,
  templateName,
} from '../crawl-model'
import { SeverityPill } from '../report/ui'
import { dayLabel, reportHref, shortUrl, type SiteProblem } from '../sites-model'

interface Props {
  lang: Lang
  crawlId: string
  /** The page's headline numbers changed (the crawl moved on, or ended). */
  onSummary: (summary: CrawlSummary) => void
  onClose: () => void
  /** The crawl was deleted. */
  onRemoved: (id: string) => void
}

/**
 * A crawl's report (M4.5): the summary, the templates with their pages and top issues, the issues
 * by template as a table, and each template's pages one click away. While the crawl goes it asks
 * about it every few seconds. Everything it says is the API's answer; titles of rules come from
 * the engine, in both languages.
 */
export default function CrawlReportCard({ lang, crawlId, onSummary, onClose, onRemoved }: Props) {
  const t = CRAWL_UI[lang].report
  const account = ACCOUNT_UI[lang]
  const [report, setReport] = useState<CrawlReport | 'loading' | 'failed'>('loading')
  const [problem, setProblem] = useState<SiteProblem | null>(null)
  const [busy, setBusy] = useState<'cancel' | 'remove' | null>(null)
  const [all, setAll] = useState(false)

  const going = report !== 'loading' && report !== 'failed' && isActive(report.crawl.state)
  useEffect(() => {
    let live = true
    let timer: number | undefined
    const load = async () => {
      const got = await getCrawl(crawlId)
      if (!live) return
      if (!got.ok) {
        setReport((current) => (current === 'loading' ? 'failed' : current))
        setProblem(got.problem)
        return
      }
      setReport(got.value)
      onSummary(got.value.crawl)
      if (isActive(got.value.crawl.state)) {
        timer = window.setTimeout(() => void load(), POLL_MS)
      }
    }
    void load()
    return () => {
      live = false
      window.clearTimeout(timer)
    }
    // The report of one crawl: asked again only when another is opened.
  }, [crawlId])

  // The crawl before this one, when this one is done and there was an earlier one that is: what
  // «compare with the previous crawl» opens.
  const [previous, setPrevious] = useState<string | null>(null)
  const done = typeof report !== 'string' && report.crawl.state === 'done' ? report.crawl : null
  const doneId = done?.id
  const doneSite = done?.siteId
  useEffect(() => {
    if (doneId === undefined || doneSite === undefined || doneSite === null) return
    let live = true
    void listCrawls(doneSite).then((got) => {
      if (!live || !got.ok) return
      const list = got.value.crawls
      const at = list.findIndex((crawl) => crawl.id === doneId)
      const older = at < 0 ? undefined : list.slice(at + 1).find((crawl) => crawl.state === 'done')
      setPrevious(older?.id ?? null)
    })
    return () => {
      live = false
    }
  }, [doneId, doneSite])

  async function onCancel() {
    setBusy('cancel')
    const cancelled = await cancelCrawl(crawlId)
    setBusy(null)
    if (!cancelled.ok) {
      setProblem(cancelled.problem)
      return
    }
    onSummary(cancelled.value)
    setReport((current) =>
      typeof current === 'string' ? current : { ...current, crawl: cancelled.value },
    )
  }

  async function onRemove() {
    setBusy('remove')
    const gone = await deleteCrawl(crawlId)
    setBusy(null)
    if (!gone.ok) {
      setProblem(gone.problem)
      return
    }
    onRemoved(crawlId)
  }

  const problemText =
    problem === null
      ? null
      : ((account.problems as Record<string, string | undefined>)[problem] ??
        account.problems.unavailable)
  const alert = problemText !== null && (
    <p
      role="alert"
      className="m-0 flex items-start gap-3 rounded-xl bg-moderate-soft p-3 text-small text-ink-2 forced-colors:border"
    >
      <TriangleAlert aria-hidden="true" size={16} className="mt-1 shrink-0 text-moderate" />
      <span className="min-w-0">{problemText}</span>
    </p>
  )

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-2">
        <h2 id="crawl-title" className="heading-2 m-0 flex items-center gap-2">
          <Layers aria-hidden="true" size={22} className="shrink-0 text-ink-3" />
          {t.title}
        </h2>
        <p className="m-0 text-body text-ink-2">{t.lead}</p>
      </div>
      <button type="button" className="btn-ghost" onClick={onClose}>
        <X size={16} aria-hidden="true" />
        {t.close}
      </button>
    </div>
  )

  if (report === 'loading' || report === 'failed') {
    return (
      <section
        aria-labelledby="crawl-title"
        aria-busy={report === 'loading'}
        className="card flex flex-col gap-4 rounded-card p-card"
      >
        {header}
        {report === 'loading' ? (
          <p role="status" className="m-0 text-small text-ink-2">
            {t.loading}
          </p>
        ) : (
          <p role="alert" className="m-0 text-small text-ink-2">
            {t.unavailable}
          </p>
        )}
      </section>
    )
  }

  const { crawl, templates, issues } = report
  const shown = all ? issues : issues.slice(0, ISSUES_SHOWN)
  return (
    <section aria-labelledby="crawl-title" className="card flex flex-col gap-6 rounded-card p-card">
      {header}
      {alert}
      <div className="flex flex-wrap items-start gap-3">
        {previous !== null && (
          <a className="btn-white self-start" href={compareHref(lang, 'crawl', previous, crawl.id)}>
            {COMPARE_UI[lang].links.previousCrawl}
          </a>
        )}
        {crawl.state === 'done' && (
          <PdfDownload
            lang={lang}
            ask={{ kind: 'crawl', id: crawl.id }}
            what={shortUrl(crawl.origin)}
          />
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
        <p className="m-0 text-small text-ink-2">
          {t.summary.origin}:{' '}
          <bdi dir="ltr" className="font-semibold break-all text-ink">
            {shortUrl(crawl.origin)}
          </bdi>
        </p>
        <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-small text-ink-2">
          <li>{CRAWL_UI[lang].row.states[crawl.state]}</li>
          <li>{t.summary.found(crawl.pagesFound)}</li>
          <li>{t.summary.checked(crawl.pagesChecked, crawl.pageCap)}</li>
          <li>{t.summary.templates(crawl.templates)}</li>
          {crawl.rendered.total > 0 && (
            <li>{t.summary.browsers(crawl.rendered.done, crawl.rendered.total)}</li>
          )}
          {crawl.finishedAt !== null && (
            <li>{t.summary.finished(dayLabel(crawl.finishedAt, lang))}</li>
          )}
        </ul>
        {crawl.state === 'failed' && crawl.error !== null && (
          <p role="status" className="m-0 text-small text-ink-2">
            {CRAWL_UI[lang].row.failed[crawl.error]}
          </p>
        )}
        {going && <p className="m-0 text-small text-ink-2">{t.waitingLead}</p>}
        <div className="flex flex-wrap gap-2">
          {going ? (
            <button
              type="button"
              className="btn-ghost"
              disabled={busy !== null}
              onClick={() => void onCancel()}
            >
              {busy === 'cancel' ? t.cancelling : t.cancel}
            </button>
          ) : (
            <button
              type="button"
              className="btn-ghost"
              disabled={busy !== null}
              onClick={() => void onRemove()}
            >
              <Trash2 size={16} aria-hidden="true" />
              {busy === 'remove' ? t.removing : t.remove}
            </button>
          )}
        </div>
      </div>

      {templates.length > 0 && (
        <section aria-labelledby="templates-title" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h3 id="templates-title" className="heading-3 m-0">
              {t.templatesTitle}
            </h3>
            <p className="m-0 text-small text-ink-2">{t.templatesLead}</p>
          </div>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {templates.map((template) => (
              <TemplateCard
                key={template.key}
                lang={lang}
                crawlId={crawlId}
                template={template}
                issues={issues}
              />
            ))}
          </ul>
        </section>
      )}

      {templates.length > 0 && (
        <section aria-labelledby="issues-title" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h3 id="issues-title" className="heading-3 m-0">
              {t.issuesTitle}
            </h3>
            <p className="m-0 text-small text-ink-2">{t.issuesLead}</p>
          </div>
          {issues.length === 0 ? (
            <p className="m-0 text-body text-ink-2">{t.issuesEmpty}</p>
          ) : (
            <>
              <div
                role="region"
                tabIndex={0}
                aria-label={t.issuesTitle}
                className="overflow-x-auto rounded-xl border border-line"
              >
                <table className="w-full min-w-max border-collapse text-start text-small">
                  <thead>
                    <tr className="bg-surface-2">
                      <th scope="col" className="p-3 text-start font-semibold text-ink">
                        {t.issueColumn}
                      </th>
                      {templates.map((template) => (
                        <th
                          key={template.key}
                          scope="col"
                          className="min-w-32 p-3 text-start font-semibold text-ink"
                        >
                          <TemplateTitle lang={lang} template={template} />
                        </th>
                      ))}
                      <th scope="col" className="p-3 text-start font-semibold text-ink">
                        {t.totalColumn}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((issue) => (
                      <IssueRow
                        key={`${issue.rendered ? 'r' : 'h'}-${issue.ruleId}`}
                        lang={lang}
                        issue={issue}
                        templates={templates}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {issues.length > ISSUES_SHOWN && (
                <button
                  type="button"
                  className="btn-white self-start"
                  aria-expanded={all}
                  onClick={() => {
                    setAll(!all)
                  }}
                >
                  {all ? t.showLess : t.showAll(issues.length)}
                </button>
              )}
            </>
          )}
        </section>
      )}
    </section>
  )
}

/** A template's name: its kind in words, then its address pattern, which reads left to right. */
function TemplateTitle({ lang, template }: { lang: Lang; template: CrawlTemplate }) {
  const name = templateName(CRAWL_UI[lang].report, template)
  return (
    <>
      <span className="block">{name.kind}</span>
      <bdi dir="ltr" className="block text-meta font-normal break-all text-ink-2">
        {name.pattern}
      </bdi>
    </>
  )
}

function IssueRow({
  lang,
  issue,
  templates,
}: {
  lang: Lang
  issue: CrawlIssue
  templates: readonly CrawlTemplate[]
}) {
  const t = CRAWL_UI[lang].report
  return (
    <tr className="border-t border-line align-top">
      <th scope="row" className="min-w-56 p-3 text-start font-normal">
        <div className="flex flex-col gap-2">
          <span className="font-semibold text-ink">{issueTitle(issue, lang)}</span>
          <span className="flex flex-wrap items-center gap-2">
            <SeverityPill severity={issue.severity} lang={lang} />
            {issue.rendered && <span className="text-meta text-ink-2">{t.renderedTag}</span>}
          </span>
          {issue.rendered && <span className="text-meta text-ink-2">{t.renderedNote}</span>}
          <details>
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-meta font-semibold text-brand-ink">
              {t.examples}
            </summary>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 pt-1">
              {issue.templates.map((cell) => {
                const template = templates.find((candidate) => candidate.key === cell.template)
                return (
                  <li key={cell.template} className="flex flex-col gap-1">
                    <span className="text-meta text-ink-2">
                      {template === undefined ? cell.template : templateLabel(t, template)}
                    </span>
                    {cell.examples.map((url) => (
                      <bdi key={url} dir="ltr" className="text-meta break-all text-ink">
                        {shortUrl(url)}
                      </bdi>
                    ))}
                  </li>
                )
              })}
            </ul>
          </details>
        </div>
      </th>
      {templates.map((template) => {
        const cell = issue.templates.find((candidate) => candidate.template === template.key)
        return (
          <td key={template.key} className="p-3 text-ink-2">
            {cell === undefined ? (
              <span aria-hidden="true">–</span>
            ) : (
              <span className="font-semibold text-ink">{t.cell(cell.pages, cell.checked)}</span>
            )}
          </td>
        )
      })}
      <td className="p-3 font-semibold text-ink">
        <span dir="ltr" className="tabular-nums">
          {issue.pages}
        </span>
      </td>
    </tr>
  )
}

function TemplateCard({
  lang,
  crawlId,
  template,
  issues,
}: {
  lang: Lang
  crawlId: string
  template: CrawlTemplate
  issues: readonly CrawlIssue[]
}) {
  const t = CRAWL_UI[lang].report
  const [open, setOpen] = useState(false)
  const top = template.topIssues
    .map((id) => issues.find((issue) => issue.ruleId === id))
    .filter((issue): issue is CrawlIssue => issue !== undefined)
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line p-4">
      <div className="flex flex-col gap-1">
        <p className="m-0 text-body font-semibold text-ink">
          <TemplateTitle lang={lang} template={template} />
        </p>
        <p className="m-0 text-small text-ink-2">{t.counts(template.found, template.checked)}</p>
      </div>
      {template.checked > 0 &&
        (top.length === 0 ? (
          <p className="m-0 text-small text-ink-2">{t.noIssues}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="m-0 text-meta font-semibold text-ink-2">{t.topIssues}</p>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {top.map((issue) => (
                <li key={issue.ruleId} className="flex flex-wrap items-center gap-2 text-small">
                  <SeverityPill severity={issue.severity} lang={lang} />
                  <span className="min-w-0 text-ink">{issueTitle(issue, lang)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      {template.representatives.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-meta font-semibold text-ink-2">{t.browsersTitle}</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {template.representatives.map((rep) => (
              <li
                key={rep.url}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <bdi dir="ltr" className="text-small break-all text-ink">
                    {shortUrl(rep.url)}
                  </bdi>
                  <span className="text-meta text-ink-2">
                    {rep.state === null ? t.notScanned : t.scanStates[rep.state]}
                    {rep.score !== null && ` · ${t.score} ${rep.score}`}
                  </span>
                </div>
                {rep.scanId !== null && (
                  <a
                    className="inline-flex min-h-11 items-center gap-1 text-small font-semibold text-brand-ink underline underline-offset-4 hover:text-ink"
                    href={reportHref(lang, rep.scanId)}
                  >
                    {t.openReport}
                    <ExternalLink size={14} aria-hidden="true" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <button
          type="button"
          className="btn-white"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open)
          }}
        >
          {open ? t.hidePages : t.showPages}
        </button>
      </div>
      {open && <TemplatePages lang={lang} crawlId={crawlId} template={template.key} />}
    </li>
  )
}

/** One template's pages, a hundred at a time. */
function TemplatePages({
  lang,
  crawlId,
  template,
}: {
  lang: Lang
  crawlId: string
  template: string
}) {
  const t = CRAWL_UI[lang].report
  const [pages, setPages] = useState<readonly CrawlPage[]>([])
  const [next, setNext] = useState<number | null>(0)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const more = async (offset: number) => {
    setLoading(true)
    const got = await getCrawlPages(crawlId, { template, offset })
    setLoading(false)
    if (!got.ok) {
      setFailed(true)
      return
    }
    setPages((current) => [...current, ...got.value.pages])
    setNext(got.value.next)
  }
  useEffect(() => {
    void more(0)
    // Loaded once when opened; the button asks for the rest.
  }, [])

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <p className="m-0 text-meta font-semibold text-ink-2">{t.pagesTitle}</p>
      {failed && (
        <p role="alert" className="m-0 text-small text-ink-2">
          {t.unavailable}
        </p>
      )}
      {!loading && !failed && pages.length === 0 && (
        <p className="m-0 text-small text-ink-2">{t.pagesEmpty}</p>
      )}
      <ul className="m-0 flex list-none flex-col p-0">
        {pages.map((page) => (
          <li
            key={page.url}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line py-3 first:border-t-0"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <bdi dir="ltr" className="text-small font-semibold break-all text-ink">
                {shortUrl(page.url)}
              </bdi>
              <span className="text-meta text-ink-2">
                {t.pageStates[page.state]}
                {page.status !== null && ` · ${t.status} ${page.status}`}
                {page.state === 'checked' && ` · ${t.pageIssues(page.issues.length)}`}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {page.scanId !== null && (
                <a
                  className="inline-flex min-h-11 items-center gap-1 text-small font-semibold text-brand-ink underline underline-offset-4 hover:text-ink"
                  href={reportHref(lang, page.scanId)}
                >
                  {t.browserScan}
                </a>
              )}
              <a
                className="inline-flex min-h-11 items-center gap-1 text-small font-semibold text-brand-ink underline underline-offset-4 hover:text-ink"
                href={page.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.openPage}
                <ExternalLink size={14} aria-hidden="true" />
              </a>
            </div>
          </li>
        ))}
      </ul>
      {next !== null && pages.length > 0 && (
        <button
          type="button"
          className="btn-white self-start"
          disabled={loading}
          onClick={() => void more(next)}
        >
          {loading ? t.loadingMore : t.loadMore}
        </button>
      )}
    </div>
  )
}

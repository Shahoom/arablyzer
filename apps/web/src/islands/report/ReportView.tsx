import { reportPath } from '@arablyzer/api-contract/codes'
import { REPORT } from '@arablyzer/i18n/report'
import type { Report } from '@arablyzer/report-schema'
import { localePath, type Lang } from '@arablyzer/seo/site'
import { Braces, Check, Copy, EyeOff, RotateCcw, TriangleAlert } from 'lucide-preact'
import { Fragment } from 'preact'
import { useState } from 'preact/hooks'
import { Bidi } from './Bidi'
import { ScanDock } from './Dock'
import { Checks, Findings, type Fixes } from './Findings'
import { Frame } from './Frame'
import { Notices } from './Notices'
import { ReadLine } from './ReadLine'
import { Categories, Headline, Summary } from './Summary'

export type { Fixes } from './Findings'

/** A tool's result's tool: its slug, and its name in the page's language when it is known. */
export interface ToolRef {
  readonly slug: string
  readonly title: string | null
}

/**
 * The finished report (M2.6 R7). A head: the address that was scanned, a line of when and what the
 * page answered, and the heading. Then two columns from lg: the aside is the summary (the score,
 * the severities), the categories and what to do with the report, and sticks under the header;
 * the main column is the thread of what was found: what was read, the notices, the findings as
 * accordions, the checks that did not fail, and, last, the form that scans another page.
 *
 * On a phone only the summary comes before the findings: the categories and the actions follow
 * the checks, as the second part of the aside (`more`) is drawn in the main column there. Each
 * place has its own copy and the other is not displayed (so not read, and not reached by the Tab
 * key): the reading order is the order on the screen at every width.
 */
export function ReportView({
  id,
  report,
  fixes,
  lang,
  tool,
}: {
  id: string
  report: Report
  fixes: Fixes | null
  lang: Lang
  /** The tool a tool page's scan ran (M2.2): its rules alone, so no overall score. */
  tool?: ToolRef | undefined
}) {
  const t = REPORT[lang]
  const url = report.target.finalUrl ?? report.target.url
  const more = (place: 'aside' | 'main') => (
    <div className={`flex-col gap-card ${place === 'aside' ? 'hidden lg:flex' : 'flex lg:hidden'}`}>
      {tool === undefined && (
        <Categories report={report} lang={lang} id={`categories-title-${place}`} />
      )}
      <Actions id={id} report={report} lang={lang} tool={tool} />
    </div>
  )
  return (
    <Frame
      url={url}
      href={url}
      meta={<Meta report={report} lang={lang} tool={tool} />}
      head={<Headline report={report} lang={lang} />}
      aside={
        <>
          <Summary report={report} lang={lang} tool={tool !== undefined} />
          {more('aside')}
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <ReadLine report={report} lang={lang} />
        {report.scan.status === 'partial' && (
          <div
            role="note"
            className="flex items-start gap-3 rounded-xl bg-moderate-soft p-3 forced-colors:border md:px-4"
          >
            <TriangleAlert aria-hidden="true" size={16} className="mt-1 shrink-0 text-moderate" />
            <div className="flex min-w-0 flex-col gap-0.5 text-small">
              <strong className="text-ink">{t.states.partial.title}</strong>
              <span className="text-ink-2">
                {/* A tool's result has no score to speak of, nor has a scan that missed the page. */}
                {tool === undefined && report.score.overall !== null
                  ? t.states.partial.text
                  : t.states.partial.tool}
              </span>
            </div>
          </div>
        )}
        <Notices notices={report.scan.notices} lang={lang} id="notices-title" />
      </div>
      <Findings report={report} fixes={fixes} lang={lang} />
      <Checks report={report} lang={lang} />
      {more('main')}
      <ScanDock lang={lang} tool={tool?.slug} />
    </Frame>
  )
}

/** The line under the address: which tool, when, what the page answered and the rules' version. */
function Meta({ report, lang, tool }: { report: Report; lang: Lang; tool: ToolRef | undefined }) {
  const t = REPORT[lang].header
  const parts = [
    tool !== undefined && (
      <Fragment key="tool">
        {t.tool} {/* The tool's name; its slug when the name could not be read. */}
        <a
          href={localePath(lang, `/tools/${tool.slug}`)}
          dir={tool.title === null ? 'ltr' : undefined}
          className="text-ink underline underline-offset-4 hover:text-brand-ink"
        >
          {tool.title === null ? tool.slug : <Bidi text={tool.title} lang={lang} />}
        </a>
      </Fragment>
    ),
    <Fragment key="date">
      {t.scannedOn}{' '}
      <span dir="ltr" className="tabular-nums">
        {report.target.fetchedAt.slice(0, 10)}
      </span>
    </Fragment>,
    report.target.http.status !== null && (
      <span key="http" dir="ltr" className="tabular-nums">
        HTTP {report.target.http.status}
      </span>
    ),
    <Fragment key="rules">
      {t.rules}{' '}
      <span dir="ltr" className="tabular-nums">
        {report.generator.rulesetVersion}
      </span>
    </Fragment>,
  ].filter((part) => part !== false)
  return (
    <p className="m-0 text-meta text-ink-2">
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && ' · '}
          {part}
        </Fragment>
      ))}
    </p>
  )
}

/**
 * What to do with the report, in the aside under the summary: scan the page again, copy the
 * report's link, read it as JSON, and the line that says it is not in search engines.
 */
function Actions({
  id,
  report,
  lang,
  tool,
}: {
  id: string
  report: Report
  lang: Lang
  tool: ToolRef | undefined
}) {
  const t = REPORT[lang].header
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => {
        setCopied(true)
      })
      .catch(() => undefined)
  }
  // Again with the same page: the tool's page for a tool's result, the home page's form otherwise.
  const again = encodeURIComponent(report.target.url)
  const rescan =
    tool === undefined
      ? `${localePath(lang, '/')}?url=${again}#scan`
      : `${localePath(lang, `/tools/${tool.slug}`)}?url=${again}`
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 md:flex md:flex-wrap lg:grid">
        <a href={rescan} className="btn-grad col-span-2">
          <RotateCcw size={16} aria-hidden="true" />
          {t.rescan}
        </a>
        <button type="button" onClick={copy} className="btn-white">
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          <span aria-live="polite">{copied ? t.copied : t.copyLink}</span>
        </button>
        <a href={reportPath(id)} className="btn-white">
          <Braces size={16} aria-hidden="true" />
          <span dir="ltr">{t.json}</span>
        </a>
      </div>
      <p className="m-0 flex items-center gap-2 text-meta text-ink-2">
        <EyeOff size={16} aria-hidden="true" className="shrink-0" />
        {t.noindex}
      </p>
    </div>
  )
}

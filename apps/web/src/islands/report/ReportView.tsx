import { reportPath } from '@arablyzer/api-contract/codes'
import { REPORT } from '@arablyzer/i18n/report'
import type { Report } from '@arablyzer/report-schema'
import { localePath, type Lang } from '@arablyzer/seo/site'
import { Braces, Check, Copy, EyeOff, RotateCcw, TriangleAlert } from 'lucide-preact'
import { useState } from 'preact/hooks'
import { Bidi } from './Bidi'
import { ScanDock } from './Dock'
import { Checks, Findings, type Fixes } from './Findings'
import { Notices } from './Notices'
import { ReadLine } from './ReadLine'
import { Categories, Summary } from './Summary'
import { Thread } from './Thread'

export type { Fixes } from './Findings'

/** A tool's result's tool: its slug, and its name in the page's language when it is known. */
export interface ToolRef {
  readonly slug: string
  readonly title: string | null
}

/**
 * The finished report, as a thread under the address that was scanned (the approved Report
 * design, in the v2 look): what was read, the notices, the summary with its score, the categories,
 * the findings as accordions, the checks that did not fail, how to share it, and the dock that
 * scans another page.
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
  return (
    <div className="flex flex-1 flex-col">
      <Thread
        lang={lang}
        url={url}
        href={url}
        meta={<Meta report={report} lang={lang} tool={tool} />}
      >
        <ReadLine report={report} lang={lang} />
        {report.scan.status === 'partial' && (
          <div
            role="note"
            className="flex items-start gap-3 rounded-lg bg-moderate-soft px-4 py-3.5 forced-colors:border"
          >
            <TriangleAlert aria-hidden="true" size={18} className="mt-1 shrink-0 text-moderate" />
            <div className="flex min-w-0 flex-col gap-1">
              <strong className="text-ink">{t.states.partial.title}</strong>
              <span className="text-[15px] leading-[1.7] text-ink-2">
                {/* A tool's result has no score to speak of, nor has a scan that missed the page. */}
                {tool === undefined && report.score.overall !== null
                  ? t.states.partial.text
                  : t.states.partial.tool}
              </span>
            </div>
          </div>
        )}
        <Notices notices={report.scan.notices} lang={lang} id="notices-title" />
        <Summary report={report} lang={lang} tool={tool !== undefined} />
        {tool === undefined && <Categories report={report} lang={lang} />}
        <Findings report={report} fixes={fixes} lang={lang} />
        <Checks report={report} lang={lang} />
        <Actions id={id} report={report} lang={lang} tool={tool} />
      </Thread>
      <ScanDock lang={lang} tool={tool?.slug} />
    </div>
  )
}

/** Under the bubble: which tool, when, what the page answered and the rules' version. */
function Meta({ report, lang, tool }: { report: Report; lang: Lang; tool: ToolRef | undefined }) {
  const t = REPORT[lang].header
  const chip = 'inline-flex h-[26px] items-center gap-1.5 rounded-full bg-surface-2 px-2.5 text-xs'
  return (
    <>
      {tool !== undefined && (
        <span className="me-1 flex flex-wrap items-center gap-x-2 text-[13px]">
          {t.tool}
          {/* The tool's name; its slug when the name could not be read. */}
          {tool.title === null ? (
            <a
              href={localePath(lang, `/tools/${tool.slug}`)}
              dir="ltr"
              className="font-mono text-ink-2 underline underline-offset-4 hover:text-brand-ink"
            >
              {tool.slug}
            </a>
          ) : (
            <a
              href={localePath(lang, `/tools/${tool.slug}`)}
              className="text-ink-2 underline underline-offset-4 hover:text-brand-ink"
            >
              <Bidi text={tool.title} lang={lang} />
            </a>
          )}
        </span>
      )}
      <span className={`${chip} text-ink-2`}>
        {t.scannedOn}
        <span dir="ltr" className="font-mono">
          {report.target.fetchedAt.slice(0, 10)}
        </span>
      </span>
      {report.target.http.status !== null && (
        <span dir="ltr" className={`${chip} font-mono text-ink-2`}>
          HTTP {report.target.http.status}
        </span>
      )}
      <span className={`${chip} text-ink-2`}>
        {t.rules}
        <span dir="ltr" className="font-mono">
          {report.generator.rulesetVersion}
        </span>
      </span>
    </>
  )
}

/** The report's link, and what to do with it: scan again, copy it, read it as JSON. */
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
      <div className="flex flex-wrap items-center gap-2.5">
        <a href={rescan} className="btn-grad">
          <RotateCcw size={16} aria-hidden="true" />
          {t.rescan}
        </a>
        <button type="button" onClick={copy} className="btn-white">
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          <span aria-live="polite">{copied ? t.copied : t.copyLink}</span>
        </button>
        <a href={reportPath(id)} className="btn-white">
          <Braces size={16} aria-hidden="true" />
          <span dir="ltr" className="font-mono">
            {t.json}
          </span>
        </a>
      </div>
      <p className="m-0 flex items-center gap-2 text-sm text-ink-3">
        <EyeOff size={16} aria-hidden="true" className="shrink-0" />
        {t.noindex}
      </p>
    </div>
  )
}

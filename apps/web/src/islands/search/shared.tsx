import { SEARCH_UI } from '@arablyzer/i18n/search'
import type { Lang } from '@arablyzer/seo/site'
import { LockKeyhole, TriangleAlert } from 'lucide-preact'
import type { ComponentChildren } from 'preact'
import type { SearchError } from '../api'
import { toCsv } from './model'

/** A number as the page shows them: Latin digits, left to right, so a row reads the same in both. */
export function Num({ children }: { children: string }) {
  return (
    <span dir="ltr" className="tabular-nums">
      {children}
    </span>
  )
}

/** A note in the page's moderate tone: a notice, a stop, a refusal. */
export function Notice({
  children,
  id,
  role = 'note',
}: {
  children: ComponentChildren
  id?: string
  role?: 'note' | 'alert' | 'status'
}) {
  return (
    <p
      id={id}
      role={role}
      className="m-0 flex items-start gap-3 rounded-xl bg-moderate-soft p-3 text-small text-ink-2 forced-colors:border"
    >
      <TriangleAlert aria-hidden="true" size={16} className="mt-1 shrink-0 text-moderate" />
      <span className="min-w-0">{children}</span>
    </p>
  )
}

/** The line that says what is kept of a request, with a lock. */
export function Privacy({ text }: { text: string }) {
  return (
    <p className="m-0 flex items-start gap-2 text-meta text-ink-2">
      <LockKeyhole size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      {text}
    </p>
  )
}

/** What a refused request says, with when to come back where the API said. */
export function errorText(lang: Lang, error: SearchError): string {
  const t = SEARCH_UI[lang].common
  // A scan's other refusals (a bad address) cannot come from these routes: they read as unavailable.
  const base = (t.errors as Readonly<Record<string, string>>)[error.code] ?? t.errors.unavailable
  return error.retryAfterSeconds === undefined
    ? base
    : `${base} ${t.retryAfter(error.retryAfterSeconds)}`
}

/**
 * Hands the visitor a CSV file made here, in the browser (a Blob and a link that is clicked and
 * removed): the rows never go to a server. The name takes the date, so two downloads differ.
 */
export function downloadCsv(name: string, rows: readonly (readonly string[])[]): void {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => {
    URL.revokeObjectURL(href)
  }, 1000)
}

import type { AdminStrings, Lang } from '@arablyzer/i18n'

// Pages of the panel are strings of HTML: every value that is not ours is escaped on its way in,
// and there is no script and no `style=""` (the stylesheet is served by the panel itself).

export const ADMIN_PATH = '/admin'
export const ASSET_PATH = '/admin/assets/admin.css'
/** The panel loads only its own stylesheet and posts only to itself. */
export const PAGE_POLICY =
  "default-src 'none'; style-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'"

export const esc = (value: unknown): string =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

/** `{name}` holes of a string of copy, filled with plain text (the caller escapes the result). */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (hole, name: string) => String(values[name] ?? hole))
}

export interface View {
  readonly lang: Lang
  readonly t: AdminStrings
  /** The signed-in administrator's address. */
  readonly email: string
  readonly now: Date
}

export type Nav = 'overview' | 'users' | 'scans' | 'audit' | 'settings'

/** A path of the panel, in the page's language; the query leaves out what is empty. */
export function href(
  lang: Lang,
  path: string,
  query: Readonly<Record<string, string | number | undefined>> = {},
): string {
  const all: [string, string | number | undefined][] = [
    ...(lang === 'en' ? ([['lang', 'en']] as [string, string][]) : []),
    ...Object.entries(query),
  ]
  const pairs = all
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(`${value ?? ''}`)}`)
  return pairs.length === 0 ? path : `${path}?${pairs.join('&')}`
}

/** A date as `2026-10-16 12:00`, in UTC, in a left-to-right run of its own. */
export function when(date: Date | null, never: string): string {
  if (date === null) return `<span class="muted">${esc(never)}</span>`
  const iso = date.toISOString()
  return `<time class="ltr" datetime="${esc(iso)}">${esc(`${iso.slice(0, 10)} ${iso.slice(11, 16)}`)}</time>`
}

/** Text that is left to right whatever the page is: an address, an id, a host name, a number. */
export const ltr = (text: string): string => `<bdi class="ltr" dir="ltr">${esc(text)}</bdi>`

export const num = (n: number): string => `<span class="ltr">${String(n)}</span>`

/** `3d 4h`, `4h 12m`, `9m`: how long the process has run. */
export function uptime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const d = Math.floor(s / 86_400)
  const h = Math.floor((s % 86_400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${String(d)}d ${String(h)}h`
  if (h > 0) return `${String(h)}h ${String(m)}m`
  return `${String(m)}m`
}

/**
 * A small line chart as inline SVG, one or two series on a shared scale: no library, no script,
 * its colours from the stylesheet. `label` is the chart's name for a screen reader, with the
 * values, which the picture alone would not give.
 */
export function spark(label: string, series: readonly (readonly number[])[]): string {
  const width = 140
  const height = 36
  const pad = 3
  const max = Math.max(1, ...series.flat())
  const points = (values: readonly number[]) =>
    values.map((value, index) => {
      const x = pad + (index * (width - 2 * pad)) / Math.max(1, values.length - 1)
      const y = height - pad - (value * (height - 2 * pad)) / max
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
  const first = series[0] ?? []
  const area =
    first.length === 0
      ? ''
      : `<polygon class="area" points="${[`${String(pad)},${String(height - pad)}`, ...points(first), `${String(width - pad)},${String(height - pad)}`].join(' ')}"/>`
  const lines = series
    .map(
      (values, index) =>
        `<polyline class="${index === 0 ? 'a' : 'b'}" points="${points(values).join(' ')}"/>`,
    )
    .join('')
  const text = series.map((values) => values.join(', ')).join(' / ')
  return `<svg class="spark" viewBox="0 0 ${String(width)} ${String(height)}" preserveAspectRatio="none" role="img" aria-label="${esc(`${label}: ${text}`)}"><line class="base" x1="${String(pad)}" y1="${String(height - pad)}" x2="${String(width - pad)}" y2="${String(height - pad)}"/>${area}${lines}</svg>`
}

export function pager(
  v: View,
  path: string,
  query: Readonly<Record<string, string | number | undefined>>,
  page: number,
  pages: number,
): string {
  if (pages <= 1) return ''
  const link = (to: number, label: string, off: boolean) =>
    off
      ? `<span class="off">${esc(label)}</span>`
      : `<a href="${esc(href(v.lang, path, { ...query, page: to === 1 ? undefined : to }))}">${esc(label)}</a>`
  return `<nav class="pager" aria-label="${esc(fill(v.t.common.page, { page, pages }))}">${link(page - 1, v.t.common.previous, page <= 1)}<span>${esc(fill(v.t.common.page, { page, pages }))}</span>${link(page + 1, v.t.common.next, page >= pages)}</nav>`
}

/**
 * A button that asks again before it acts: a disclosure whose form holds the real submit. The
 * server wants the second click's `confirm=yes` too, so a request that skipped the page does nothing.
 */
export function confirmForm(
  v: View,
  options: {
    readonly action: string
    readonly summary: string
    readonly note?: string
    readonly danger?: boolean
    readonly small?: boolean
    readonly fields?: string
    readonly submit?: string
  },
): string {
  const classes = [
    'act',
    options.danger === true ? 'danger' : '',
    options.small === true ? 'small' : '',
  ]
    .filter((c) => c !== '')
    .join(' ')
  return `<details class="${classes}"><summary>${esc(options.summary)}</summary><form method="post" action="${esc(options.action)}">${options.note === undefined ? '' : `<p>${esc(options.note)}</p>`}${options.fields ?? ''}<p><strong>${esc(v.t.actions.areYouSure)}</strong></p><button class="${options.danger === true ? 'danger' : 'primary'}" type="submit" name="confirm" value="yes">${esc(options.submit ?? v.t.common.confirm)}</button></form></details>`
}

export function layout(v: View, active: Nav | null, title: string, body: string): string {
  const { t } = v
  const other: Lang = v.lang === 'ar' ? 'en' : 'ar'
  const nav = (key: Nav, path: string) =>
    `<a href="${esc(href(v.lang, path))}"${key === active ? ' aria-current="page"' : ''}>${esc(t.nav[key])}</a>`
  return `<!doctype html>
<html lang="${v.lang}" dir="${v.lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="${esc(PAGE_POLICY)}">
<title>${esc(title)} · ${esc(t.appName)}</title>
<link rel="stylesheet" href="${ASSET_PATH}">
</head>
<body>
<header class="top">
<a class="brand" href="${esc(href(v.lang, ADMIN_PATH))}"><span class="mark"></span><span>${esc(t.appName)}</span></a>
<div class="who"><span>${esc(fill(t.signedInAs, { email: v.email }))}</span><a href="${esc(href(other, ADMIN_PATH))}" lang="${other}">${esc(t.language)}</a></div>
</header>
<div class="shell">
<nav class="nav" aria-label="${esc(t.appName)}">${nav('overview', ADMIN_PATH)}${nav('users', `${ADMIN_PATH}/users`)}${nav('scans', `${ADMIN_PATH}/scans`)}${nav('audit', `${ADMIN_PATH}/audit`)}${nav('settings', `${ADMIN_PATH}/settings`)}</nav>
<main>
${body}
</main>
</div>
</body>
</html>`
}

/** A page with no menu: the sign-in-again page, which the panel shows before it trusts the session. */
export function bare(v: View, title: string, body: string): string {
  return layout(v, null, title, body)
}

import { createHash } from 'node:crypto'
import { PLATFORM_UI, REPORT, type CategoryName, type Lang } from '@arablyzer/i18n'
import type { PlatformData, PlatformInstall, ScanStore } from '@arablyzer/store'

// The merchant panel (M9): the page a store's dashboard opens inside itself. A string of HTML the
// API renders, with every value that is not ours escaped on its way in, no `style=""`, and the
// one stylesheet and the one small script (Salla's handshake) named in the page's policy by hash.

export type PanelStatus = 'none' | 'running' | 'ready' | 'failed'

export interface PanelSummary {
  readonly storeName: string | null
  readonly storeUrl: string | null
  /** The platform no longer accepts our tokens: the merchant must activate the app again. */
  readonly reauth: boolean
  readonly status: PanelStatus
  readonly scanId: string | null
  readonly score: number | null
  readonly bySeverity: Readonly<
    Record<'critical' | 'serious' | 'moderate' | 'minor', number>
  > | null
  readonly categories: readonly { readonly id: string; readonly score: number }[]
  readonly at: Date | null
}

/** What the panel says of a store: its newest audit, read from the scan, never kept a second time. */
export async function summaryOf(
  deps: { readonly data: PlatformData; readonly store: ScanStore },
  install: PlatformInstall,
): Promise<PanelSummary> {
  const base = {
    storeName: install.storeName,
    storeUrl: install.storeUrl,
    reauth: install.status === 'reauth',
    scanId: null,
    score: null,
    bySeverity: null,
    categories: [],
    at: null,
  } as const
  const audit = await deps.data.latestAudit(install.id)
  if (audit === null) return { ...base, status: install.auditDueAt === null ? 'none' : 'running' }
  const scan = await deps.store.get(audit.scanId)
  if (scan === null) return { ...base, status: install.auditDueAt === null ? 'none' : 'running' }
  if (scan.state === 'queued' || scan.state === 'running') {
    return { ...base, status: 'running', scanId: scan.id, at: audit.at }
  }
  const report = scan.report
  if (scan.state === 'failed' || report?.score.overall == null) {
    return { ...base, status: 'failed', scanId: scan.id, at: scan.finishedAt ?? audit.at }
  }
  const { bySeverity } = report.summary
  return {
    ...base,
    status: 'ready',
    scanId: scan.id,
    score: report.score.overall,
    bySeverity: {
      critical: bySeverity.critical,
      serious: bySeverity.serious,
      moderate: bySeverity.moderate,
      minor: bySeverity.minor,
    },
    categories: Object.entries(report.score.categories)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
      .map(([id, score]) => ({ id, score })),
    at: scan.finishedAt ?? audit.at,
  }
}

const esc = (value: unknown): string =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

/** Text that is left to right whatever the page is: a number, an address, a date. */
const ltr = (text: string | number): string => `<bdi dir="ltr">${esc(text)}</bdi>`

const stamp = (date: Date): string => {
  const iso = date.toISOString()
  return `<time datetime="${esc(iso)}">${ltr(`${iso.slice(0, 10)} ${iso.slice(11, 16)}`)}</time>`
}

export type Theme = 'light' | 'dark' | undefined
export const langOf = (raw: string | undefined): Lang =>
  raw?.toLowerCase().startsWith('en') ? 'en' : 'ar'
export const themeOf = (raw: string | undefined): Theme =>
  raw === 'dark' || raw === 'light' ? raw : undefined

const hostOf = (url: string | null): string | null => {
  try {
    return url === null ? null : new URL(url).host
  } catch {
    return null
  }
}

/** The report's page on the site, in the page's language. */
export const reportHref = (origin: string, lang: Lang, scanId: string): string =>
  `${origin}${lang === 'en' ? '/en' : ''}/r/${scanId}`

/** The panel's content for a store, as the platform's dashboard shows it. */
export function summaryBody(summary: PanelSummary, lang: Lang, origin: string): string {
  const t = PLATFORM_UI[lang]
  const host = hostOf(summary.storeUrl)
  const store =
    summary.storeName === null && host === null
      ? ''
      : `<p class="store"><span class="muted">${esc(t.storeLabel)}</span> ${
          summary.storeName === null ? '' : `<span class="name">${esc(summary.storeName)}</span> `
        }${host === null ? '' : ltr(host)}</p>`
  const head = `<header><h1>${esc(t.panelTitle)}</h1>${store}</header>`
  const reauth = summary.reauth ? `<p class="note warn">${esc(t.reauth)}</p>` : ''
  const privacy = `<p class="muted small">${esc(t.privacy)}</p>`
  if (summary.status !== 'ready' || summary.score === null || summary.bySeverity === null) {
    const message =
      summary.status === 'running' ? t.running : summary.status === 'failed' ? t.failed : t.none
    return `${head}${reauth}<p class="note">${esc(message)}</p>${privacy}`
  }
  const severities = (['critical', 'serious', 'moderate', 'minor'] as const)
    .map(
      (level) =>
        `<li class="sev ${level}"><span>${esc(t.severities[level])}</span> ${ltr(summary.bySeverity?.[level] ?? 0)}</li>`,
    )
    .join('')
  const names: Readonly<Record<string, string>> = REPORT[lang].categories
  const categories = summary.categories
    .map(
      (category) =>
        `<li><span>${esc(names[category.id as CategoryName] ?? category.id)}</span> ${ltr(category.score)}<meter min="0" max="100" value="${String(category.score)}" aria-hidden="true"></meter></li>`,
    )
    .join('')
  const report =
    summary.scanId === null
      ? ''
      : `<p><a class="button" data-external href="${esc(reportHref(origin, lang, summary.scanId))}" target="_blank" rel="noopener noreferrer">${esc(t.openReport)}</a></p><p class="muted small">${esc(t.reportNote)}</p>`
  return `${head}${reauth}
<section class="card score"><p class="muted">${esc(t.scoreLabel)}</p><p class="big">${ltr(summary.score)} <span class="muted">${esc(t.outOf)}</span> ${ltr(100)}</p>${
    summary.at === null ? '' : `<p class="muted small">${esc(t.auditedAt)} ${stamp(summary.at)}</p>`
  }</section>
<section class="card"><h2>${esc(t.findingsHeading)}</h2><ul class="list">${severities}</ul></section>${
    categories === ''
      ? ''
      : `<section class="card"><h2>${esc(t.categoriesHeading)}</h2><ul class="list cats">${categories}</ul></section>`
  }
${report}${privacy}`
}

/** A page that says one thing: the panel could not open. */
export const noticeBody = (
  lang: Lang,
  message: 'notInstalled' | 'expired' | 'unavailable',
): string => {
  const t = PLATFORM_UI[lang]
  return `<header><h1>${esc(t.panelTitle)}</h1></header><p class="note">${esc(t[message])}</p>`
}

/** Where an install by the authorize-and-callback flow ends. */
export function installedBody(lang: Lang, ok: boolean, dashboardUrl: string | null): string {
  const t = PLATFORM_UI[lang]
  const link =
    dashboardUrl === null
      ? ''
      : `<p><a class="button" href="${esc(dashboardUrl)}">${esc(t.openDashboard)}</a></p>`
  return `<header><h1>${esc(ok ? t.installedTitle : t.installFailedTitle)}</h1></header><p class="note">${esc(ok ? t.installedBody : t.installFailedBody)}</p>${link}`
}

/**
 * The page's one stylesheet. The values are the site's tokens, one brand hue, no gradient, weights
 * 400 and 600, logical properties (the page is right in both directions), no letter-spacing.
 */
export const PANEL_CSS = `
:root { color-scheme: light dark; --bg: #f6f8fb; --card: #ffffff; --line: #e3e8ef; --ink: #0b1b2b; --ink-2: #475467; --brand: #007d88; --brand-ink: #ffffff; --critical: #be123c; --serious: #b45309; --moderate: #7a5b00; --minor: #475467; --warn-bg: #fef3dd; --warn-ink: #7a4a00; }
:root[data-theme="dark"] { color-scheme: dark; --bg: #1d1e20; --card: #26282b; --line: #3a3d42; --ink: #f1f3f5; --ink-2: #b4bcc6; --brand: #baefe3; --brand-ink: #0b1b2b; --critical: #fda4af; --serious: #fbbf24; --moderate: #e8c35a; --minor: #b4bcc6; --warn-bg: #3d2a08; --warn-ink: #fbbf24; }
:root[data-theme="light"] { color-scheme: light; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --bg: #1d1e20; --card: #26282b; --line: #3a3d42; --ink: #f1f3f5; --ink-2: #b4bcc6; --brand: #baefe3; --brand-ink: #0b1b2b; --critical: #fda4af; --serious: #fbbf24; --moderate: #e8c35a; --minor: #b4bcc6; --warn-bg: #3d2a08; --warn-ink: #fbbf24; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 400 15px/1.7 system-ui, -apple-system, "Segoe UI", Tahoma, "Noto Sans Arabic", sans-serif; }
main { max-inline-size: 640px; margin-inline: auto; padding: 20px 16px 32px; }
h1 { margin: 0 0 4px; font-size: 20px; font-weight: 600; }
h2 { margin: 0 0 8px; font-size: 16px; font-weight: 600; }
p { margin: 0 0 8px; }
.muted { color: var(--ink-2); }
.small { font-size: 13px; }
.store { margin-block-end: 16px; }
.name { font-weight: 600; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; margin-block-end: 12px; }
.big { margin: 0; font-size: 36px; font-weight: 600; line-height: 1.3; }
.big .muted { font-size: 15px; font-weight: 400; }
.list { list-style: none; margin: 0; padding: 0; }
.list li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-block: 6px; border-block-end: 1px solid var(--line); }
.list li:last-child { border-block-end: 0; }
.sev.critical bdi { color: var(--critical); font-weight: 600; }
.sev.serious bdi { color: var(--serious); font-weight: 600; }
.sev.moderate bdi { color: var(--moderate); font-weight: 600; }
.sev.minor bdi { color: var(--minor); font-weight: 600; }
.cats li { flex-wrap: wrap; }
.cats meter { inline-size: 100%; block-size: 8px; }
.note { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; }
.note.warn { background: var(--warn-bg); color: var(--warn-ink); border-color: var(--warn-ink); }
.button { display: inline-block; background: var(--brand); color: var(--brand-ink); text-decoration: none; font-weight: 600; padding: 10px 18px; border-radius: 8px; }
.button:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }
`

/** The handshake with Salla's dashboard (Embedded SDK, Authentication): initialise, then say ready. */
export const SALLA_SCRIPT = `(function () {
  var sdk = window.SallaEmbeddedSDK && window.SallaEmbeddedSDK.embedded;
  document.addEventListener('click', function (event) {
    var link = event.target && event.target.closest ? event.target.closest('a[data-external]') : null;
    if (!link) return;
    event.preventDefault();
    var opened = window.open(link.href, '_blank');
    if (opened) { opened.opener = null; } else if (sdk && sdk.page && sdk.page.redirect) { sdk.page.redirect(link.href); }
  });
  if (!sdk) return;
  function ready() { try { sdk.ready(); } catch (error) { /* the dashboard shows its own message */ } }
  Promise.resolve().then(function () { return sdk.init(); }).then(ready, ready);
  if (typeof sdk.onThemeChange === 'function') {
    sdk.onThemeChange(function (theme) {
      var name = typeof theme === 'string' ? theme : theme && theme.theme;
      document.documentElement.setAttribute('data-theme', name === 'dark' ? 'dark' : 'light');
    });
  }
})();`

/** The Embedded SDK, pinned to a version and to its hash (Installation: the CDN script tag). */
export const SALLA_SDK_URL = 'https://unpkg.com/@salla.sa/embedded-sdk@0.2.7/dist/umd/index.js'
export const SALLA_SDK_INTEGRITY =
  'sha384-vC+7QSu8G7BKrTkRz/qmsDFFRjUT9hLAooZSc2FGaeToAWibCx+lPG4gjcfRRpwn'

const hashOf = (source: string): string =>
  `'sha256-${createHash('sha256').update(source).digest('base64')}'`

/** Where each platform's dashboard may frame the panel (Zid: Embedded Apps, Content Security Policy). */
export const FRAME_ANCESTORS = {
  salla: 'https://s.salla.sa',
  zid: "'self' https://*.zid.dev https://web.zid.sa https://dashboard.zid.sa",
} as const

/** What a panel page may load: its stylesheet and, for Salla, its script and the SDK, by hash. */
export function policyFor(platform: 'salla' | 'zid'): string {
  return [
    "default-src 'none'",
    `style-src ${hashOf(PANEL_CSS)}`,
    ...(platform === 'salla' ? [`script-src ${hashOf(SALLA_SCRIPT)} ${SALLA_SDK_URL}`] : []),
    "img-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${FRAME_ANCESTORS[platform]}`,
  ].join('; ')
}

export function page(options: {
  readonly platform: 'salla' | 'zid'
  readonly lang: Lang
  readonly theme: Theme
  readonly body: string
}): string {
  const t = PLATFORM_UI[options.lang]
  const scripts =
    options.platform === 'salla'
      ? `<script src="${SALLA_SDK_URL}" integrity="${SALLA_SDK_INTEGRITY}" crossorigin="anonymous"></script><script>${SALLA_SCRIPT}</script>`
      : ''
  return `<!doctype html>
<html lang="${options.lang}" dir="${options.lang === 'ar' ? 'rtl' : 'ltr'}"${options.theme === undefined ? '' : ` data-theme="${options.theme}"`}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><meta name="color-scheme" content="light dark"><title>${esc(t.panelTitle)}</title><style>${PANEL_CSS}</style></head><body><main>
${options.body}
</main>${scripts}</body></html>`
}

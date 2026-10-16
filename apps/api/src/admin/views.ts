import type { ScanState } from '@arablyzer/api-contract'
import type {
  AccountPlan,
  PlanOverrides,
  PlanCatalog,
  ScanLimits,
  AuthLimits,
} from '@arablyzer/plans'
import { OVERRIDE_BOUNDS } from '@arablyzer/plans'
import type {
  AdminScanRow,
  AdminUserRow,
  ApiKeyRecord,
  AuditEntry,
  Crawl,
  HistoryEntry,
  Monitor,
  Overview,
  PdfJob,
  SavedSite,
} from '@arablyzer/store'
import {
  confirmForm,
  esc,
  fill,
  href,
  layout,
  ltr,
  num,
  pager,
  spark,
  uptime,
  when,
  ADMIN_PATH,
  type View,
} from './render'

const SCAN_STATES: readonly ScanState[] = ['queued', 'running', 'complete', 'partial', 'failed']

/** A report's page, in the panel's language. */
export const reportHref = (v: View, scanId: string): string =>
  `${v.lang === 'en' ? '/en' : ''}/r/${encodeURIComponent(scanId)}`

const userHref = (v: View, id: string): string =>
  href(v.lang, `${ADMIN_PATH}/users/${encodeURIComponent(id)}`)

const table = (
  head: readonly { label: string; num?: boolean }[],
  rows: readonly string[],
): string =>
  `<div class="tablewrap"><table><thead><tr>${head
    .map((h) => `<th${h.num === true ? ' class="num"' : ''}>${esc(h.label)}</th>`)
    .join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`

const empty = (v: View): string => `<p class="muted">${esc(v.t.common.none)}</p>`

/** The one line above a page's content that says what just happened, or what went wrong. */
export function flash(v: View, done: string | undefined, error: string | undefined): string {
  const doneText = done === undefined ? undefined : (v.t.done as Record<string, string>)[done]
  const errorText = error === undefined ? undefined : (v.t.problem as Record<string, string>)[error]
  if (errorText !== undefined) return `<p class="flash bad" role="alert">${esc(errorText)}</p>`
  if (doneText !== undefined) return `<p class="flash ok" role="status">${esc(doneText)}</p>`
  return ''
}

export interface Health {
  readonly databaseMs: number
  readonly queue: { readonly waiting: number; readonly ms: number } | null
  readonly uptimeSeconds: number
}

export function overviewPage(v: View, o: Overview, health: Health): string {
  const { t } = v
  const stat = (label: string, value: string | number, sub = '', hot = false) =>
    `<div class="stat${hot ? ' hot' : ''}"><div class="label">${esc(label)}</div><div class="value">${num(Number(value))}</div>${sub === '' ? '' : `<div class="sub">${sub}</div>`}</div>`
  const split = (anonymous: number, account: number) =>
    `${esc(t.overview.byAnonymous)} ${num(anonymous)} · ${esc(t.overview.byAccounts)} ${num(account)}`
  const chip = (kind: 'ok' | 'warn' | 'bad', text: string) =>
    `<span class="chip ${kind}">${esc(text)}</span>`

  // The worker is not asked: it answers nothing. What the scans say of it is all there is.
  const oldest = o.scans.oldestQueuedAt
  const waitedMinutes =
    oldest === null ? 0 : Math.floor((v.now.getTime() - oldest.getTime()) / 60_000)
  const stuck = oldest !== null && waitedMinutes >= 2 && o.scans.running === 0
  const worker = stuck
    ? {
        kind: 'bad' as const,
        text: fill(t.overview.workerStuck, { minutes: waitedMinutes }),
      }
    : o.scans.running > 0 || o.scans.queued > 0
      ? {
          kind: 'ok' as const,
          text: fill(t.overview.workerBusy, { running: o.scans.running, queued: o.scans.queued }),
        }
      : o.scans.lastFinishedAt === null
        ? { kind: 'ok' as const, text: t.overview.workerNever }
        : {
            kind: 'ok' as const,
            text: fill(t.overview.workerIdle, {
              when: `${o.scans.lastFinishedAt.toISOString().slice(0, 10)} ${o.scans.lastFinishedAt.toISOString().slice(11, 16)} UTC`,
            }),
          }
  const queueHealth =
    health.queue === null ? chip('bad', t.overview.bad) : chip('ok', t.overview.ok)
  const queueNote =
    health.queue === null
      ? ''
      : esc(fill(t.overview.queueNote, { n: health.queue.waiting, ms: health.queue.ms }))

  const body = `<h1>${esc(t.overview.title)}</h1>
<div class="grid">
${stat(t.overview.accounts, o.accounts.total)}
${stat(t.overview.newWeek, o.accounts.newThisWeek)}
${stat(t.overview.activeWeek, o.accounts.activeThisWeek)}
${stat(t.overview.suspended, o.accounts.suspended)}
${stat(t.overview.scansToday, o.scans.today.anonymous + o.scans.today.account, split(o.scans.today.anonymous, o.scans.today.account))}
${stat(t.overview.scansWeek, o.scans.week.anonymous + o.scans.week.account, split(o.scans.week.anonymous, o.scans.week.account))}
${stat(t.overview.queue, health.queue?.waiting ?? o.scans.queued)}
${stat(t.overview.running, o.scans.running)}
${stat(t.overview.failed24h, o.scans.failed24h, '', o.scans.failed24h > 0)}
${stat(t.overview.monitors, o.monitorsActive)}
${stat(t.overview.crawls, o.crawlsRunning)}
${stat(t.overview.pdfs, o.pdfsThisMonth)}
</div>
<div class="grid two">
<section class="card"><h2>${esc(t.overview.trendScans)}</h2>
${spark(t.overview.trendScans, [o.daily.scansAnonymous, o.daily.scansAccount])}
<div class="legend"><span><i class="a"></i>${esc(t.overview.legendAnonymous)}</span><span><i class="b"></i>${esc(t.overview.legendAccounts)}</span><span class="muted">${esc(t.overview.trends)}</span></div></section>
<section class="card"><h2>${esc(t.overview.trendAccounts)}</h2>
${spark(t.overview.trendAccounts, [o.daily.newAccounts])}
<div class="legend"><span class="muted">${esc(t.overview.trends)}</span></div></section>
</div>
<section class="card"><h2>${esc(t.overview.health)}</h2>
<div class="health">
<div><strong>${esc(t.overview.api)}</strong>${chip('ok', t.overview.ok)}<span class="muted">${esc(fill(t.overview.apiNote, { uptime: uptime(health.uptimeSeconds) }))}</span></div>
<div><strong>${esc(t.overview.database)}</strong>${chip('ok', t.overview.ok)}<span class="muted">${esc(fill(t.overview.databaseNote, { ms: health.databaseMs }))}</span></div>
<div><strong>${esc(t.overview.queueService)}</strong>${queueHealth}<span class="muted">${queueNote}</span></div>
<div><strong>${esc(t.overview.worker)}</strong>${chip(worker.kind, worker.kind === 'bad' ? t.overview.bad : t.overview.ok)}<span class="muted">${esc(worker.text)}</span></div>
</div></section>
<p class="muted small">${esc(t.overview.note)} ${esc(t.common.utc)}</p>`
  return layout(v, 'overview', t.overview.title, body)
}

export interface UsersRow {
  readonly row: AdminUserRow
  readonly plan: AccountPlan
  /** Scans the account has used in the plan's window; null where the limiter cannot say. */
  readonly used: number | null
}

export function usersPage(
  v: View,
  input: {
    readonly q: string
    readonly rows: readonly UsersRow[]
    readonly total: number
    readonly page: number
    readonly pages: number
  },
): string {
  const { t } = v
  const rows = input.rows.map(({ row, plan, used }) => {
    const status =
      row.suspendedAt === null
        ? `<span class="chip ok">${esc(t.users.active)}</span>`
        : `<span class="chip bad">${esc(t.users.suspended)}</span>`
    return `<tr><td><a href="${esc(userHref(v, row.id))}">${ltr(row.email)}</a></td><td>${esc(row.name)}</td><td>${when(row.createdAt, t.common.never)}</td><td>${when(row.lastSignInAt, t.common.never)}</td><td>${esc(t.users.planAccount)}${row.hasOverrides ? ` <span class="chip info">${esc(t.users.overridden)}</span>` : ''}</td><td class="num">${used === null ? '—' : num(used)} / ${num(plan.scans.scans)}</td><td class="num">${num(row.sites)}</td><td class="num">${num(row.monitors)}</td><td class="num">${num(row.apiKeys)}</td><td>${status}</td></tr>`
  })
  const body = `<h1>${esc(t.users.title)}</h1>
<form class="bar" method="get" action="${ADMIN_PATH}/users" role="search">
${v.lang === 'en' ? '<input type="hidden" name="lang" value="en">' : ''}
<div><label for="q">${esc(t.common.search)}</label><input id="q" type="search" name="q" value="${esc(input.q)}" placeholder="${esc(t.users.placeholder)}" maxlength="100" autocomplete="off"></div>
<button class="primary" type="submit">${esc(t.common.search)}</button>
<span class="muted">${esc(fill(t.common.results, { n: input.total }))}</span>
</form>
${rows.length === 0 ? empty(v) : table([{ label: t.users.email }, { label: t.users.name }, { label: t.users.created }, { label: t.users.lastSignIn }, { label: t.users.plan }, { label: t.users.scansUsed, num: true }, { label: t.users.sites, num: true }, { label: t.users.monitors, num: true }, { label: t.users.keys, num: true }, { label: t.users.status }], rows)}
${pager(v, `${ADMIN_PATH}/users`, { q: input.q === '' ? undefined : input.q }, input.page, input.pages)}
<p class="muted small">${esc(t.common.utc)}</p>`
  return layout(v, 'users', t.users.title, body)
}

export interface UserDetail {
  readonly row: AdminUserRow
  readonly overrides: PlanOverrides
  readonly base: AccountPlan
  readonly plan: AccountPlan
  readonly used: number | null
  readonly pdfUsed: number
  readonly sites: readonly SavedSite[]
  readonly history: readonly HistoryEntry[]
  readonly monitors: readonly Monitor[]
  readonly crawls: readonly Crawl[]
  readonly pdfs: readonly PdfJob[]
  readonly keys: readonly ApiKeyRecord[]
  readonly audit: readonly AuditEntry[]
  /** The signed-in administrator's own account. */
  readonly self: boolean
}

const windowName = (v: View, seconds: number): string =>
  seconds === 86_400
    ? v.t.user.window.day
    : seconds === 3600
      ? v.t.user.window.hour
      : fill(v.t.user.window.seconds, { n: seconds })

export function userPage(v: View, d: UserDetail, flashHtml: string): string {
  const { t } = v
  const { row } = d
  const base = `${ADMIN_PATH}/users/${encodeURIComponent(row.id)}`
  const act = (path: string) => href(v.lang, `${base}/${path}`)
  const siteUrl = new Map(d.sites.map((site) => [site.id, site.url]))
  const usage = (label: string, used: number | null, limit: number) =>
    `<tr><th scope="row">${esc(label)}</th><td class="num">${used === null ? '—' : num(used)} / ${num(limit)}</td><td>${used === null || limit === 0 ? '' : `<meter aria-label="${esc(label)}" min="0" max="${String(limit)}" value="${String(Math.min(used, limit))}"></meter>`}</td></tr>`

  const profile = `<section class="card"><h2>${esc(t.user.profile)}</h2><dl class="facts">
<dt>${esc(t.users.email)}</dt><dd>${ltr(row.email)}</dd>
<dt>${esc(t.users.name)}</dt><dd>${esc(row.name)}</dd>
<dt>${esc(t.user.id)}</dt><dd>${ltr(row.id)}</dd>
<dt>${esc(t.user.languageField)}</dt><dd>${row.language === null ? '—' : ltr(row.language)}</dd>
<dt>${esc(t.users.created)}</dt><dd>${when(row.createdAt, t.common.never)}</dd>
<dt>${esc(t.users.lastSignIn)}</dt><dd>${when(row.lastSignInAt, t.common.never)}</dd>
<dt>${esc(t.user.sessions)}</dt><dd>${num(row.sessions)}</dd>
<dt>${esc(t.users.status)}</dt><dd>${row.suspendedAt === null ? `<span class="chip ok">${esc(t.users.active)}</span>` : `<span class="chip bad">${esc(t.users.suspended)}</span> ${when(row.suspendedAt, t.common.never)}`}</dd>
</dl></section>`

  const planCard = `<section class="card"><h2>${esc(t.user.plan)}</h2><table><tbody>
${usage(`${t.user.scansWindow} (${windowName(v, d.plan.scans.seconds)})`, d.used, d.plan.scans.scans)}
${usage(t.user.savedSites, d.sites.length, d.plan.savedSites)}
${usage(t.user.monitored, d.monitors.filter((m) => !m.paused).length, d.plan.monitoredSites)}
${usage(t.user.pdfMonth, d.pdfUsed, d.plan.pdfPerMonth)}
<tr><th scope="row">${esc(t.user.crawlPages)}</th><td class="num" colspan="2">${num(d.plan.crawlPages)}</td></tr>
<tr><th scope="row">${esc(t.user.whiteLabel)}</th><td colspan="2">${esc(d.plan.whiteLabel ? t.common.yes : t.common.no)}</td></tr>
</tbody></table></section>`

  const sites =
    d.sites.length === 0
      ? empty(v)
      : table(
          [{ label: t.user.url }, { label: t.users.created }],
          d.sites.map(
            (site) =>
              `<tr><td class="url">${esc(site.url)}</td><td>${when(site.createdAt, t.common.never)}</td></tr>`,
          ),
        )
  const scans =
    d.history.length === 0
      ? empty(v)
      : table(
          [
            { label: t.scans.when },
            { label: t.user.url },
            { label: t.scans.state },
            { label: t.scans.score, num: true },
            { label: t.common.report },
          ],
          d.history.map(
            (scan) =>
              `<tr><td>${when(scan.createdAt, t.common.never)}</td><td class="url">${esc(scan.url)}</td><td>${esc(t.scans.states[scan.state])}</td><td class="num">${scan.score === null ? '—' : num(scan.score)}</td><td><a href="${esc(reportHref(v, scan.scanId))}">${esc(t.common.open)}</a></td></tr>`,
          ),
        )
  const monitors =
    d.monitors.length === 0
      ? empty(v)
      : table(
          [{ label: t.user.url }, { label: t.user.state }, { label: t.scans.when }],
          d.monitors.map(
            (m) =>
              `<tr><td class="url">${esc(siteUrl.get(m.siteId) ?? '')}</td><td>${esc(fill(t.user.every, { days: m.everyDays }))}${m.paused ? ` <span class="chip warn">${esc(t.user.paused)}</span>` : ''}</td><td>${when(m.nextRunAt, t.common.never)}</td></tr>`,
          ),
        )
  const crawls =
    d.crawls.length === 0
      ? empty(v)
      : table(
          [
            { label: t.user.url },
            { label: t.user.state },
            { label: t.user.pages, num: true },
            { label: t.scans.when },
          ],
          d.crawls.map(
            (c) =>
              `<tr><td class="url">${esc(c.startUrl)}</td><td>${esc(c.state)}</td><td class="num">${num(c.pagesChecked)} / ${num(c.pagesFound)}</td><td>${when(c.createdAt, t.common.never)}</td></tr>`,
          ),
        )
  const pdfs =
    d.pdfs.length === 0
      ? empty(v)
      : table(
          [{ label: t.user.kind }, { label: t.user.state }, { label: t.scans.when }],
          d.pdfs.map(
            (p) =>
              `<tr><td>${esc(p.kind)}</td><td>${esc(p.state)}</td><td>${when(p.createdAt, t.common.never)}</td></tr>`,
          ),
        )
  const keys =
    d.keys.length === 0
      ? empty(v)
      : table(
          [
            { label: t.user.keyName },
            { label: t.user.keyPrefix },
            { label: t.users.created },
            { label: t.user.lastUsed },
            { label: '' },
          ],
          d.keys.map(
            (k) =>
              `<tr><td>${esc(k.name)}</td><td>${ltr(k.prefix)}</td><td>${when(k.createdAt, t.common.never)}</td><td>${when(k.lastUsedAt, t.common.never)}</td><td>${confirmForm(v, { action: act(`keys/${encodeURIComponent(k.id)}/revoke`), summary: t.actions.revokeKey, note: t.actions.revokeKeyNote, danger: true, small: true })}</td></tr>`,
          ),
        )

  const field = (
    name: keyof typeof OVERRIDE_BOUNDS,
    label: string,
    current: number | undefined,
    fallback: number,
  ) =>
    `<div><label for="o-${name}">${esc(label)}</label><input id="o-${name}" type="number" name="${name}" inputmode="numeric" min="${String(OVERRIDE_BOUNDS[name].min)}" max="${String(OVERRIDE_BOUNDS[name].max)}" step="1" value="${current === undefined ? '' : String(current)}" placeholder="${String(fallback)}"></div>`
  const whiteLabelValue =
    d.overrides.whiteLabel === undefined ? '' : d.overrides.whiteLabel ? 'on' : 'off'
  const option = (value: string, label: string) =>
    `<option value="${value}"${value === whiteLabelValue ? ' selected' : ''}>${esc(label)}</option>`
  const overridesForm = confirmForm(v, {
    action: act('overrides'),
    summary: t.actions.overrides,
    note: t.actions.overridesNote,
    submit: t.actions.saveOverrides,
    fields: `<div class="fields">${field('scansPerDay', t.actions.scansPerDay, d.overrides.scansPerDay, Math.round((d.base.scans.scans * 86_400) / d.base.scans.seconds))}${field('savedSites', t.actions.savedSites, d.overrides.savedSites, d.base.savedSites)}${field('monitoredSites', t.actions.monitoredSites, d.overrides.monitoredSites, d.base.monitoredSites)}${field('crawlPages', t.actions.crawlPages, d.overrides.crawlPages, d.base.crawlPages)}${field('pdfPerMonth', t.actions.pdfPerMonth, d.overrides.pdfPerMonth, d.base.pdfPerMonth)}<div><label for="o-whiteLabel">${esc(t.actions.whiteLabel)}</label><select id="o-whiteLabel" name="whiteLabel">${option('', t.actions.whiteLabelDefault)}${option('on', t.actions.whiteLabelOn)}${option('off', t.actions.whiteLabelOff)}</select></div></div>`,
  })
  const actions = d.self
    ? `<p class="muted">${esc(t.actions.itself)}</p>${overridesForm}`
    : `${row.suspendedAt === null ? confirmForm(v, { action: act('suspend'), summary: t.actions.suspend, note: t.actions.suspendNote, danger: true }) : confirmForm(v, { action: act('unsuspend'), summary: t.actions.unsuspend, note: t.actions.unsuspendNote })}
${confirmForm(v, { action: act('revoke-sessions'), summary: t.actions.revokeSessions, note: t.actions.revokeSessionsNote })}
${overridesForm}
${confirmForm(v, {
  action: act('delete'),
  summary: t.actions.delete,
  note: t.actions.deleteNote,
  danger: true,
  fields: `<p><label for="del-email">${esc(fill(t.actions.typeEmail, { email: row.email }))}</label><input id="del-email" type="text" name="email" autocomplete="off" spellcheck="false" dir="ltr" required></p>`,
})}`

  const body = `<p><a href="${esc(href(v.lang, `${ADMIN_PATH}/users`))}">${esc(t.nav.users)}</a></p>
<h1>${ltr(row.email)}</h1>
${flashHtml}
<div class="grid two">${profile}${planCard}</div>
<section class="card"><h2>${esc(t.actions.title)}</h2>${actions}</section>
<section class="card"><h2>${esc(t.user.sitesTitle)}</h2>${sites}</section>
<section class="card"><h2>${esc(t.user.scansTitle)}</h2>${scans}</section>
<section class="card"><h2>${esc(t.user.monitorsTitle)}</h2>${monitors}</section>
<section class="card"><h2>${esc(t.user.crawlsTitle)}</h2>${crawls}</section>
<section class="card"><h2>${esc(t.user.pdfsTitle)}</h2>${pdfs}</section>
<section class="card"><h2>${esc(t.user.keysTitle)}</h2>${keys}</section>
<section class="card"><h2>${esc(t.user.auditTitle)}</h2>${auditTable(v, d.audit)}</section>
<p class="muted small">${esc(t.common.utc)}</p>`
  return layout(v, 'users', row.email, body)
}

export function userMissingPage(v: View): string {
  return layout(
    v,
    'users',
    v.t.user.title,
    `<h1>${esc(v.t.user.title)}</h1><p>${esc(v.t.user.notFound)}</p><p><a href="${esc(href(v.lang, `${ADMIN_PATH}/users`))}">${esc(v.t.nav.users)}</a></p>`,
  )
}

function detailText(detail: AuditEntry['detail']): string {
  return Object.entries(detail)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' ')
}

export function auditTable(v: View, entries: readonly AuditEntry[]): string {
  const { t } = v
  if (entries.length === 0) return empty(v)
  const labels = t.audit.actions as Record<string, string>
  return table(
    [
      { label: t.audit.when },
      { label: t.audit.who },
      { label: t.audit.action },
      { label: t.audit.target },
      { label: t.audit.detail },
      { label: t.audit.network },
    ],
    entries.map((entry) => {
      const target =
        entry.targetId === null
          ? '—'
          : entry.targetEmail === null
            ? `<span class="muted">${esc(t.audit.erased)}</span> ${ltr(entry.targetId.slice(0, 15))}`
            : `<a href="${esc(userHref(v, entry.targetId))}">${ltr(entry.targetEmail)}</a>`
      const who =
        entry.actorEmail === null
          ? `<span class="muted">${esc(t.audit.erased)}</span>`
          : ltr(entry.actorEmail)
      return `<tr><td>${when(entry.at, t.common.never)}</td><td>${who}</td><td>${esc(labels[entry.action] ?? entry.action)}</td><td>${target}</td><td class="ltr small">${esc(detailText(entry.detail))}</td><td>${entry.network === null ? '—' : ltr(entry.network)}</td></tr>`
    }),
  )
}

export function auditPage(
  v: View,
  input: {
    readonly rows: readonly AuditEntry[]
    readonly page: number
    readonly pages: number
    readonly total: number
  },
): string {
  const body = `<h1>${esc(v.t.audit.title)}</h1>
<p class="muted">${esc(v.t.audit.note)} ${esc(fill(v.t.common.results, { n: input.total }))}</p>
${auditTable(v, input.rows)}
${pager(v, `${ADMIN_PATH}/audit`, {}, input.page, input.pages)}
<p class="muted small">${esc(v.t.common.utc)}</p>`
  return layout(v, 'audit', v.t.audit.title, body)
}

export function scansPage(
  v: View,
  input: {
    readonly rows: readonly AdminScanRow[]
    readonly total: number
    readonly page: number
    readonly pages: number
    readonly state: ScanState | undefined
    readonly host: string
    readonly top: readonly { readonly host: string; readonly count: number }[]
  },
  flashHtml: string,
): string {
  const { t } = v
  const query = { state: input.state, host: input.host === '' ? undefined : input.host }
  const rows = input.rows.map((scan) => {
    const owner =
      scan.userId === null
        ? `<span class="muted">${esc(t.common.anonymous)}</span>`
        : `<a href="${esc(userHref(v, scan.userId))}">${ltr(scan.userEmail ?? scan.userId)}</a>`
    const remove = confirmForm(v, {
      action: href(v.lang, `${ADMIN_PATH}/scans/${encodeURIComponent(scan.id)}/delete`, query),
      summary: t.scans.delete,
      note: t.scans.deleteNote,
      danger: true,
      small: true,
    })
    return `<tr><td>${when(scan.createdAt, t.common.never)}</td><td class="url">${esc(scan.url)}</td><td>${scan.tool === null ? '' : ltr(scan.tool)}</td><td>${esc(t.scans.states[scan.state])}</td><td class="num">${scan.score === null ? '—' : num(scan.score)}</td><td>${owner}</td><td><a href="${esc(reportHref(v, scan.id))}">${esc(t.common.open)}</a></td><td>${remove}</td></tr>`
  })
  const options = [
    `<option value="">${esc(t.common.all)}</option>`,
    ...SCAN_STATES.map(
      (state) =>
        `<option value="${state}"${state === input.state ? ' selected' : ''}>${esc(t.scans.states[state])}</option>`,
    ),
  ].join('')
  const body = `<h1>${esc(t.scans.title)}</h1>
${flashHtml}
<form class="bar" method="get" action="${ADMIN_PATH}/scans">
${v.lang === 'en' ? '<input type="hidden" name="lang" value="en">' : ''}
<div><label for="state">${esc(t.scans.state)}</label><select id="state" name="state">${options}</select></div>
<div><label for="host">${esc(t.scans.host)}</label><input id="host" type="search" name="host" value="${esc(input.host)}" placeholder="${esc(t.scans.hostPlaceholder)}" maxlength="100" autocomplete="off" dir="ltr"></div>
<button class="primary" type="submit">${esc(t.common.filter)}</button>
<span class="muted">${esc(fill(t.common.results, { n: input.total }))}</span>
</form>
${rows.length === 0 ? empty(v) : table([{ label: t.scans.when }, { label: t.scans.url }, { label: t.scans.tool }, { label: t.scans.state }, { label: t.scans.score, num: true }, { label: t.scans.owner }, { label: t.common.report }, { label: '' }], rows)}
${pager(v, `${ADMIN_PATH}/scans`, query, input.page, input.pages)}
<section class="card"><h2>${esc(t.scans.topHosts)}</h2>${
    input.top.length === 0
      ? empty(v)
      : table(
          [{ label: t.scans.host }, { label: t.scans.title, num: true }],
          input.top.map(
            (h) =>
              `<tr><td><a href="${esc(href(v.lang, `${ADMIN_PATH}/scans`, { host: h.host }))}">${ltr(h.host)}</a></td><td class="num">${num(h.count)}</td></tr>`,
          ),
        )
  }</section>
<p class="muted small">${esc(t.common.utc)}</p>`
  return layout(v, 'scans', t.scans.title, body)
}

export interface SettingsInput {
  readonly plans: PlanCatalog
  readonly limits: ScanLimits
  readonly authLimits: AuthLimits | undefined
  readonly flags: Readonly<
    Record<
      'suggest' | 'serp' | 'mail' | 'searchConsole' | 'monitors' | 'crawls' | 'pdfs' | 'keys',
      boolean
    >
  >
  readonly admins: number
  readonly node: string
  readonly platform: string
  readonly startedAt: Date
}

export function settingsPage(v: View, s: SettingsInput): string {
  const { t } = v
  const row = (label: string, value: string) =>
    `<tr><th scope="row">${esc(label)}</th><td>${value}</td></tr>`
  const planTable = (
    plan: AccountPlan,
    title: string,
  ) => `<section class="card"><h2>${esc(title)}</h2><table><tbody>
${row(t.settings.scans, esc(fill(t.settings.scansValue, { n: plan.scans.scans, seconds: plan.scans.seconds })))}
${row(t.settings.inFlight, num(plan.inFlight))}
${row(t.settings.savedSites, num(plan.savedSites))}
${row(t.settings.historyDays, num(plan.historyDays))}
${row(t.settings.monitoredSites, num(plan.monitoredSites))}
${row(t.settings.monitorEveryDays, num(plan.monitorEveryDays))}
${row(t.settings.crawlPages, num(plan.crawlPages))}
${row(t.settings.pdfPerMonth, num(plan.pdfPerMonth))}
${row(t.settings.whiteLabel, esc(plan.whiteLabel ? t.common.yes : t.common.no))}
${row(t.settings.apiKeys, num(plan.apiKeys))}
${row(t.settings.apiScans, plan.apiScans === null ? esc(t.settings.apiScansAll) : num(plan.apiScans))}
${row(t.settings.apiRequests, num(plan.apiRequests))}
</tbody></table></section>`
  const window = (w: { scans: number; seconds: number }) =>
    esc(fill(t.settings.scansValue, { n: w.scans, seconds: w.seconds }))
  const flag = (label: string, on: boolean) =>
    row(
      label,
      `<span class="chip ${on ? 'ok' : ''}">${esc(on ? t.settings.on : t.settings.off)}</span>`,
    )
  const body = `<h1>${esc(t.settings.title)}</h1>
<p class="muted">${esc(t.settings.note)}</p>
<div class="grid two">
${planTable(s.plans.account, t.settings.planAccount)}
${s.plans.pro === null ? '' : planTable(s.plans.pro, 'Pro')}
${s.plans.agency === null ? '' : planTable(s.plans.agency, 'Agency')}
<section class="card"><h2>${esc(t.settings.limits)}</h2><table><tbody>
${row(t.settings.perConnection, window(s.limits.perConnection))}
${row(t.settings.perNetwork, window(s.limits.perNetwork))}
${row(t.settings.attempts, window(s.limits.attempts))}
${row(t.settings.perHost, window(s.limits.perHost))}
${row(t.settings.queueMax, num(s.limits.queue))}
${row(t.settings.inFlightAnon, num(s.limits.inFlight))}
</tbody></table></section>
<section class="card"><h2>${esc(t.settings.flags)}</h2><table><tbody>
${flag(t.settings.accounts, true)}
${flag(t.settings.suggest, s.flags.suggest)}
${flag(t.settings.serp, s.flags.serp)}
${flag(t.settings.mail, s.flags.mail)}
${flag(t.settings.searchConsole, s.flags.searchConsole)}
${flag(t.settings.monitorsFlag, s.flags.monitors)}
${flag(t.settings.crawlsFlag, s.flags.crawls)}
${flag(t.settings.pdfsFlag, s.flags.pdfs)}
${flag(t.settings.keysFlag, s.flags.keys)}
${row(t.settings.admins, esc(fill(t.settings.adminsValue, { n: s.admins })))}
</tbody></table></section>
<section class="card"><h2>${esc(t.settings.versions)}</h2><table><tbody>
${row(t.settings.node, ltr(s.node))}
${row(t.settings.platform, ltr(s.platform))}
${row(t.settings.startedAt, when(s.startedAt, t.common.never))}
</tbody></table></section>
</div>
<p class="muted small">${esc(t.common.utc)}</p>`
  return layout(v, 'settings', t.settings.title, body)
}

export function reauthPage(v: View, action: string, hours: number): string {
  const { t } = v
  return layout(
    v,
    null,
    t.reauth.title,
    `<div class="center card"><h1>${esc(t.reauth.title)}</h1><p>${esc(fill(t.reauth.body, { hours }))}</p><form method="post" action="${esc(action)}"><button class="primary" type="submit">${esc(t.reauth.button)}</button></form></div>`,
  )
}

import {
  AlertsRequest,
  ALERTS_PATH,
  ALERTS_TEST_PATH,
  MonitorRequest,
  SITE_ID_PATTERN,
  SITES_PATH,
  TREND_LENGTH,
  type AlertSettings,
  type AlertsResponse,
  type MonitorResponse,
  type UrlErrorCode,
  type WebhookTestResponse,
} from '@arablyzer/api-contract'
import type { EgressPolicy, Resolver } from '@arablyzer/egress'
import { ALERT_TEXT } from '@arablyzer/i18n/alerts'
import type { RateLimiter, StoredAlerts } from '@arablyzer/store'
import { quietly } from '@arablyzer/store'
import type { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { planOf, type AccountsDeps, type SessionAccess } from './accounts'
import { fromTheSite } from './guards'
import type { Mailer } from './monitor/mail'
import { firstRunAt, monitorSummary } from './monitor/schedule'
import { newWebhookSecret, webhookTarget, type WebhookSender } from './monitor/webhook'
import { resolveTarget } from './target'

export interface MonitorsDeps {
  readonly access: SessionAccess
  readonly accounts: AccountsDeps
  readonly origin: string | undefined
  readonly policy: EgressPolicy
  readonly resolver: Resolver
  readonly limiter: RateLimiter
  readonly log: ((message: string) => void) | undefined
  readonly now: () => Date
  readonly sender: WebhookSender
  readonly mail: Mailer
}

const MAX_BODY_BYTES = 8 * 1024

/** A webhook's address that is not accepted answers with the code a scan's address would. */
const URL_STATUS: Readonly<Record<UrlErrorCode, 400 | 422>> = {
  'invalid-url': 400,
  'unsupported-scheme': 400,
  'url-too-long': 400,
  'credentials-in-url': 400,
  'port-not-allowed': 400,
  'blocked-host': 422,
  'blocked-address': 422,
  'dns-failed': 422,
}

/** Saving settings and sending a test are each limited per person, so they cannot be used to probe addresses. */
const SAVE_WINDOW = { scans: 20, seconds: 600 }
const TEST_WINDOW = { scans: 5, seconds: 600 }

/** The settings as the page reads them: the address and the secret are never in it. */
export function settingsOf(stored: StoredAlerts, mail: Mailer): AlertSettings {
  return {
    webhook:
      stored.webhook === null
        ? null
        : {
            host: new URL(stored.webhook.url).host,
            kind: stored.webhook.kind,
            failures: stored.webhook.failures,
            disabled: stored.webhook.disabledAt !== null,
          },
    dropThreshold: stored.dropThreshold,
    onCritical: stored.onCritical,
    onDown: stored.onDown,
    weeklySummary: stored.weeklySummary,
    email: { available: mail.available, enabled: mail.available && stored.email },
  }
}

/**
 * Monitoring and alerts (M4.3): turning a saved site's monitoring on and off, and where a person's
 * alerts go. Behind the session and the same Origin and size guards as the other account routes;
 * another person's site is a 404, as one that does not exist is.
 */
export function mountMonitors(app: Hono, deps: MonitorsDeps): void {
  const { access } = deps
  const { monitors } = deps.accounts
  if (monitors === undefined) return
  const told = quietly('Monitors', deps.log)
  const guard = (json: boolean) =>
    fromTheSite({
      origin: deps.origin,
      json,
      refuse: (c) => access.fail(c, 'bad-request'),
      foreign: told,
    })
  const small = bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => access.fail(c, 'bad-request'),
  })

  app.put(`${SITES_PATH}/:id/monitor`, guard(true), small, async (c) => {
    let raw: unknown
    try {
      raw = await c.req.json()
    } catch {
      return access.fail(c, 'bad-request')
    }
    const request = MonitorRequest.safeParse(raw)
    if (!request.success) return access.fail(c, 'bad-request')
    const read = await access.require(c)
    if (read instanceof Response) return read
    const id = c.req.param('id')
    const site = SITE_ID_PATTERN.test(id) ? await access.data.site(read.user.id, id) : null
    if (site === null) return access.fail(c, 'not-found')
    if (!request.data.enabled) {
      await monitors.disable(read.user.id, site.id)
      const off: MonitorResponse = { monitor: null }
      return c.json(off)
    }
    const plan = planOf(access.plans, read.user.id)
    const now = deps.now()
    const enabled = await monitors.enable(
      read.user.id,
      site.id,
      { everyDays: plan.monitorEveryDays, nextRunAt: firstRunAt(now), createdAt: now },
      plan.monitoredSites,
    )
    if (enabled.kind === 'limit') {
      return c.json({ error: 'plan-limit', limit: 'monitoredSites', plan: plan.id }, 403)
    }
    const trend = (await monitors.trend(read.user.id, TREND_LENGTH)).get(site.id) ?? []
    const body: MonitorResponse = { monitor: monitorSummary(enabled.monitor, trend) }
    return c.json(body)
  })

  app.get(ALERTS_PATH, async (c) => {
    const read = await access.require(c)
    if (read instanceof Response) return read
    return c.json(settingsOf(await monitors.alerts(read.user.id), deps.mail))
  })

  app.put(ALERTS_PATH, guard(true), small, async (c) => {
    let raw: unknown
    try {
      raw = await c.req.json()
    } catch {
      return access.fail(c, 'bad-request')
    }
    const request = AlertsRequest.safeParse(raw)
    if (!request.success) return access.fail(c, 'bad-request')
    const read = await access.require(c)
    if (read instanceof Response) return read
    const wanted = request.data
    if (wanted.email === true && !deps.mail.available) return access.fail(c, 'bad-request')
    const saved = await deps.limiter.take(
      `alerts:${read.user.id}`,
      SAVE_WINDOW,
      deps.now().getTime(),
    )
    if (!saved.ok) return access.fail(c, 'rate-limited', saved.retryAfterSeconds)

    const current = await monitors.alerts(read.user.id)
    let webhook:
      { url: string; secret: string; kind: 'slack' | 'discord' | 'generic' } | null | undefined
    let secret: string | undefined
    if (wanted.webhookUrl === null) {
      webhook = null
    } else if (wanted.webhookUrl !== undefined) {
      const target = webhookTarget(wanted.webhookUrl, deps.policy)
      if (!target.ok) return c.json({ error: target.code }, URL_STATUS[target.code])
      const resolved = await resolveTarget(
        { url: new URL(target.url), host: target.host, port: 443 },
        deps.policy,
        deps.resolver,
      )
      if (!resolved.ok) return c.json({ error: resolved.code }, URL_STATUS[resolved.code])
      if (current.webhook?.url !== target.url || wanted.rotateSecret === true) {
        secret = newWebhookSecret()
        webhook = { url: target.url, secret, kind: target.kind }
      }
    } else if (wanted.rotateSecret === true && current.webhook !== null) {
      secret = newWebhookSecret()
      webhook = { url: current.webhook.url, secret, kind: current.webhook.kind }
    }
    const next = await monitors.saveAlerts(read.user.id, {
      ...(webhook === undefined ? {} : { webhook }),
      ...(wanted.dropThreshold === undefined ? {} : { dropThreshold: wanted.dropThreshold }),
      ...(wanted.onCritical === undefined ? {} : { onCritical: wanted.onCritical }),
      ...(wanted.onDown === undefined ? {} : { onDown: wanted.onDown }),
      ...(wanted.weeklySummary === undefined ? {} : { weeklySummary: wanted.weeklySummary }),
      ...(wanted.email === undefined ? {} : { email: wanted.email }),
    })
    const body: AlertsResponse = {
      ...settingsOf(next, deps.mail),
      ...(secret === undefined ? {} : { secret }),
    }
    return c.json(body)
  })

  app.post(ALERTS_TEST_PATH, guard(false), async (c) => {
    const read = await access.require(c)
    if (read instanceof Response) return read
    const stored = (await monitors.alerts(read.user.id)).webhook
    if (stored === null) return access.fail(c, 'bad-request')
    const taken = await deps.limiter.take(
      `webhook-test:${read.user.id}`,
      TEST_WINDOW,
      deps.now().getTime(),
    )
    if (!taken.ok) return access.fail(c, 'rate-limited', taken.retryAfterSeconds)
    const at = deps.now()
    const text = ALERT_TEXT[read.user.language === 'en' ? 'en' : 'ar'].test
    const sent = await deps.sender.send(stored, {
      type: 'webhook.test',
      lines: [text],
      data: {},
      at,
    })
    // A test that gets through is the way a disabled webhook is turned on again.
    if (sent.ok) await monitors.reenable(read.user.id)
    const body: WebhookTestResponse = { ok: sent.ok, status: sent.status }
    return c.json(body)
  })
}

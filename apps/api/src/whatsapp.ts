import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import {
  SITE_ID_PATTERN,
  SITES_PATH,
  WHATSAPP_CODE_LENGTH,
  WHATSAPP_PATH,
  WHATSAPP_VERIFY_PATH,
  WHATSAPP_WEBHOOK_PATH,
  WhatsappCodeRequest,
  WhatsappPhoneRequest,
  WhatsappSiteRequest,
  type WhatsappState,
} from '@arablyzer/api-contract'
import type { MonitorData, RateLimiter } from '@arablyzer/store'
import { quietly } from '@arablyzer/store'
import type { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { planOf, type AccountsDeps, type SessionAccess } from './accounts'
import { fromTheSite } from './guards'
import type { WhatsApp, WhatsAppSettings } from './monitor/whatsapp'

export interface WhatsappDeps {
  readonly access: SessionAccess
  readonly accounts: AccountsDeps
  readonly origin: string | undefined
  readonly limiter: RateLimiter
  readonly log: ((message: string) => void) | undefined
  readonly now: () => Date
  readonly whatsapp: WhatsApp
  /** Turns a code into what is stored; the key is the sending token, so a copy of the table proves nothing. */
  readonly codeKey: string
}

/** How long a code lives, how many wrong tries it takes, and how many codes one person, one number and the server send. */
export const CODE_TTL_MS = 10 * 60_000
export const CODE_ATTEMPTS = 5
const PERSON_WINDOW = { scans: 3, seconds: 3600 }
const NUMBER_WINDOW = { scans: 3, seconds: 3600 }
const SERVER_WINDOW = { scans: 120, seconds: 3600 }
const MAX_BODY_BYTES = 2 * 1024

const ARABIC_DIGITS = /[٠-٩۰-۹]/g

/**
 * A number as a person types it (spaces, dashes, a leading 00, Arabic-Indic digits) to E.164 with the
 * plus; null for anything that cannot be one.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(ARABIC_DIGITS, (d) => String((d.codePointAt(0) ?? 0) & 0xf))
  let compact = digits.replace(/[\s().-]/g, '')
  if (compact.startsWith('00')) compact = `+${compact.slice(2)}`
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null
}

/** The number with its middle hidden: the page shows which number, not all of it. */
export function maskPhone(phone: string): string {
  return `${phone.slice(0, 4)}${'•'.repeat(Math.max(phone.length - 7, 3))}${phone.slice(-3)}`
}

const hashOf = (key: string, userId: string, phone: string, code: string): string =>
  createHmac('sha256', key).update(`${userId}\n${phone}\n${code}`).digest('base64url')

/** What the pages read: the provider, the plan, the number, and the sites with their opt-ins. */
export function whatsappStateReader(
  deps: Pick<WhatsappDeps, 'accounts' | 'whatsapp'>,
): (userId: string) => Promise<WhatsappState> {
  return async (userId) => {
    const { monitors } = deps.accounts
    const off: WhatsappState = {
      available: deps.whatsapp.available,
      allowed: false,
      phone: null,
      verified: false,
      sites: [],
    }
    if (monitors === undefined || !deps.whatsapp.available) return off
    const plan = await planOf(deps.accounts.plans, userId)
    if (!plan.whatsappAlerts) return off
    const [number, optedIn, watched, sites] = await Promise.all([
      monitors.whatsapp(userId),
      monitors.whatsappSites(userId),
      monitors.monitors(userId),
      deps.accounts.data.sites(userId),
    ])
    const monitored = new Set(watched.map((monitor) => monitor.siteId))
    return {
      available: true,
      allowed: true,
      phone: number === null ? null : maskPhone(number.phone),
      verified: number?.verifiedAt != null,
      sites: sites
        .filter((site) => monitored.has(site.id))
        .map((site) => ({ id: site.id, url: site.url, enabled: optedIn.has(site.id) })),
    }
  }
}

/**
 * WhatsApp alerts (M5.6): the number and its code, and each monitored site's opt-in. Behind the
 * session and the same Origin and size guards as the other account routes; nothing is sent to a
 * number until its owner has given back a code we sent to it, and no code is sent without a plan
 * that has WhatsApp alerts. Codes are limited per person, per number and for the server.
 */
export function mountWhatsapp(app: Hono, deps: WhatsappDeps): void {
  const { access } = deps
  const { monitors } = deps.accounts
  if (monitors === undefined) return
  const told = quietly('WhatsApp', deps.log)
  const state = whatsappStateReader(deps)
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

  app.put(WHATSAPP_PATH, guard(true), small, async (c) => {
    let raw: unknown
    try {
      raw = await c.req.json()
    } catch {
      return access.fail(c, 'bad-request')
    }
    const request = WhatsappPhoneRequest.safeParse(raw)
    if (!request.success) return access.fail(c, 'bad-request')
    const read = await access.require(c)
    if (read instanceof Response) return read
    if (!deps.whatsapp.available) return access.fail(c, 'not-found')
    const plan = await planOf(access.plans, read.user.id)
    if (!plan.whatsappAlerts) {
      return c.json({ error: 'plan-limit', limit: 'whatsapp', plan: plan.id }, 403)
    }
    const phone = normalizePhone(request.data.phone)
    if (phone === null) return access.fail(c, 'bad-request')
    const at = deps.now()
    // The number's own bucket is keyed by a hash: the limiter never holds the number.
    const numberKey = createHmac('sha256', deps.codeKey).update(phone).digest('base64url')
    for (const [key, window] of [
      [`wa-code:${read.user.id}`, PERSON_WINDOW],
      [`wa-number:${numberKey}`, NUMBER_WINDOW],
      ['wa-code-all', SERVER_WINDOW],
    ] as const) {
      const taken = await deps.limiter.take(key, window, at.getTime())
      if (!taken.ok) return access.fail(c, 'rate-limited', taken.retryAfterSeconds)
    }
    const code = String(randomInt(0, 10 ** WHATSAPP_CODE_LENGTH)).padStart(
      WHATSAPP_CODE_LENGTH,
      '0',
    )
    const sent = await deps.whatsapp.send({
      to: phone,
      template: 'verify',
      language: read.user.language === 'en' ? 'en' : 'ar',
      params: [code],
    })
    if (sent === 'rejected') return access.fail(c, 'bad-request')
    if (sent === 'retry') return access.fail(c, 'unavailable')
    await monitors.startWhatsapp(read.user.id, {
      phone,
      codeHash: hashOf(deps.codeKey, read.user.id, phone, code),
      expiresAt: new Date(at.getTime() + CODE_TTL_MS),
      at,
    })
    return c.json(await state(read.user.id))
  })

  app.post(WHATSAPP_VERIFY_PATH, guard(true), small, async (c) => {
    let raw: unknown
    try {
      raw = await c.req.json()
    } catch {
      return access.fail(c, 'bad-request')
    }
    const request = WhatsappCodeRequest.safeParse(raw)
    if (!request.success) return access.fail(c, 'bad-request')
    const read = await access.require(c)
    if (read instanceof Response) return read
    if (!deps.whatsapp.available) return access.fail(c, 'not-found')
    const number = await monitors.whatsapp(read.user.id)
    if (number === null) return access.fail(c, 'invalid-token')
    const checked = await monitors.confirmWhatsapp(
      read.user.id,
      hashOf(deps.codeKey, read.user.id, number.phone, request.data.code),
      deps.now(),
      CODE_ATTEMPTS,
    )
    if (checked === 'locked') return access.fail(c, 'rate-limited', CODE_TTL_MS / 1000)
    if (checked !== 'verified') return access.fail(c, 'invalid-token')
    return c.json(await state(read.user.id))
  })

  app.delete(WHATSAPP_PATH, guard(false), async (c) => {
    const read = await access.require(c)
    if (read instanceof Response) return read
    await monitors.removeWhatsapp(read.user.id)
    return c.json(await state(read.user.id))
  })

  app.put(`${SITES_PATH}/:id/whatsapp`, guard(true), small, async (c) => {
    let raw: unknown
    try {
      raw = await c.req.json()
    } catch {
      return access.fail(c, 'bad-request')
    }
    const request = WhatsappSiteRequest.safeParse(raw)
    if (!request.success) return access.fail(c, 'bad-request')
    const read = await access.require(c)
    if (read instanceof Response) return read
    if (!deps.whatsapp.available) return access.fail(c, 'not-found')
    const id = c.req.param('id')
    const site = SITE_ID_PATTERN.test(id) ? await access.data.site(read.user.id, id) : null
    if (site === null) return access.fail(c, 'not-found')
    if (request.data.enabled) {
      const plan = await planOf(access.plans, read.user.id)
      if (!plan.whatsappAlerts) {
        return c.json({ error: 'plan-limit', limit: 'whatsapp', plan: plan.id }, 403)
      }
    }
    const result = await monitors.setWhatsappSite(read.user.id, site.id, request.data.enabled)
    if (result === 'no-monitor') return access.fail(c, 'not-found')
    if (result === 'unverified') return access.fail(c, 'bad-request')
    return c.json(await state(read.user.id))
  })
}

export interface WebhookDeps {
  readonly monitors: MonitorData
  readonly settings: NonNullable<WhatsAppSettings['webhook']>
  readonly log: ((message: string) => void) | undefined
}

/** The words that mean "stop writing to me", in the two languages, once lower-cased and stripped. */
const STOP_WORDS = new Set([
  'stop',
  'unsubscribe',
  'cancel',
  'end',
  'optout',
  'إيقاف',
  'ايقاف',
  'توقف',
  'إلغاء',
  'الغاء',
  'الغاءالاشتراك',
  'إلغاءالاشتراك',
])

const normalizeWord = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

const equal = (a: string, b: string): boolean => {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

interface InboundMessage {
  readonly from?: unknown
  readonly type?: unknown
  readonly text?: { readonly body?: unknown }
}

/**
 * Meta's webhook for this number (M5.6), the one way a person's reply reaches us. A GET answers
 * Meta's check with the challenge it sends, for the verify token. A POST is believed only with a
 * valid `X-Hub-Signature-256` (HMAC-SHA256 of the raw body under the app secret). A text that is
 * "stop" (or its Arabic words) makes us forget that number, so nothing more is sent to it; every
 * other message and every delivery status is ignored. It answers 200 to a valid request whatever
 * it held, so Meta does not retry it.
 */
export function mountWhatsappWebhook(app: Hono, deps: WebhookDeps): void {
  const told = quietly('WhatsApp webhook', deps.log)

  app.get(WHATSAPP_WEBHOOK_PATH, (c) => {
    const token = c.req.query('hub.verify_token') ?? ''
    const challenge = c.req.query('hub.challenge') ?? ''
    if (c.req.query('hub.mode') !== 'subscribe' || !equal(token, deps.settings.verifyToken)) {
      return c.text('Forbidden', 403)
    }
    return c.text(challenge.slice(0, 200))
  })

  app.post(
    WHATSAPP_WEBHOOK_PATH,
    bodyLimit({ maxSize: 256 * 1024, onError: (c) => c.text('Too large', 413) }),
    async (c) => {
      const body = Buffer.from(await c.req.arrayBuffer())
      const given = c.req.header('x-hub-signature-256') ?? ''
      const expected = `sha256=${createHmac('sha256', deps.settings.appSecret).update(body).digest('hex')}`
      if (!equal(given, expected)) return c.text('Unauthorized', 401)
      let stopped = 0
      try {
        const payload = JSON.parse(body.toString('utf8')) as {
          entry?: { changes?: { value?: { messages?: InboundMessage[] } }[] }[]
        }
        for (const entry of payload.entry ?? []) {
          for (const change of entry.changes ?? []) {
            for (const message of change.value?.messages ?? []) {
              const text = message.text?.body
              if (message.type !== 'text' || typeof text !== 'string') continue
              if (typeof message.from !== 'string' || !/^\d{6,15}$/.test(message.from)) continue
              if (STOP_WORDS.has(normalizeWord(text))) {
                stopped += await deps.monitors.removeWhatsappNumber(`+${message.from}`)
              }
            }
          }
        }
      } catch (error) {
        told(new Error(error instanceof Error ? error.message : 'A WhatsApp webhook failed'))
        return c.text('Unavailable', 503)
      }
      return c.json({ ok: true, stopped })
    },
  )
}

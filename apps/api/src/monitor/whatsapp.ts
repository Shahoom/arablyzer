import { safeFetch, type EgressPolicy, type Resolver } from '@arablyzer/egress'
import { USER_AGENT } from '@arablyzer/engine/identity'
import type { MailOutcome } from './mail'

/** `cloud` turns WhatsApp alerts on; unset (or `off`), they are off and nothing else is read. */
export const WHATSAPP_PROVIDER_VARIABLE = 'ARABLYZER_WHATSAPP_PROVIDER'
/** The sending number's id in Meta's WhatsApp Manager (not the phone number itself). */
export const WHATSAPP_PHONE_ID_VARIABLE = 'WHATSAPP_PHONE_NUMBER_ID'
/** A permanent token of a system user with the `whatsapp_business_messaging` permission. */
export const WHATSAPP_TOKEN_VARIABLE = 'WHATSAPP_ACCESS_TOKEN'
/** The Graph API version the calls name; optional. */
export const WHATSAPP_VERSION_VARIABLE = 'WHATSAPP_API_VERSION'
/** The app's secret and the token Meta's webhook check sends; both optional, together they turn on STOP. */
export const WHATSAPP_APP_SECRET_VARIABLE = 'WHATSAPP_APP_SECRET'
export const WHATSAPP_VERIFY_TOKEN_VARIABLE = 'WHATSAPP_VERIFY_TOKEN'

export const DEFAULT_API_VERSION = 'v23.0'

/**
 * The approved templates (written out in docs/design/plans/m5.6-whatsapp-alerts.md for the owner to
 * create in WhatsApp Manager). A business-initiated message needs one, so nothing here is free text.
 */
export const WHATSAPP_TEMPLATES = {
  scoreDrop: 'arablyzer_score_drop',
  critical: 'arablyzer_critical',
  down: 'arablyzer_site_down',
  paused: 'arablyzer_monitor_paused',
  verify: 'arablyzer_verify',
} as const
export type WhatsAppTemplate = keyof typeof WHATSAPP_TEMPLATES

export interface WhatsAppMessage {
  /** E.164 with the plus. */
  readonly to: string
  readonly template: WhatsAppTemplate
  readonly language: 'ar' | 'en'
  /** The template's variables in order; each is made one clean line before it is sent. */
  readonly params: readonly string[]
}

/**
 * Where an alert can go besides a webhook and mail. `available` is what the pages read to offer it.
 * `send` never throws.
 */
export interface WhatsApp {
  readonly available: boolean
  send(message: WhatsAppMessage): Promise<MailOutcome>
}

export const noWhatsApp: WhatsApp = {
  available: false,
  send: () => Promise.resolve('rejected'),
}

const TIMEOUT_MS = 10_000
const MAX_BYTES = 16 * 1024
/** Meta refuses a variable with a line break, a tab or a long run of spaces, and one past 1024 characters. */
const PARAM_MAX = 200

/** One clean line: what a scan or a person could have typed cannot break a template. */
export const templateParam = (value: string): string =>
  value.replace(/\s+/g, ' ').trim().slice(0, PARAM_MAX) || '-'

/** Meta's error codes for "too fast" (80007, 130429, 131048, 131056): worth another try. */
const RATE_CODES = new Set([4, 80007, 130429, 131048, 131056])

export interface CloudOptions {
  readonly phoneNumberId: string
  readonly accessToken: string
  readonly version: string
  readonly policy: EgressPolicy
  readonly resolver?: Resolver
  /** Another way to fetch; tests pass their own, which answers for Meta. */
  readonly fetcher?: typeof safeFetch
  /** Told a status or an error code, never the token, a number or a body. */
  readonly log?: (message: string) => void
}

/** The components of a template message: the body's variables, and for a code the copy button's. */
function components(message: WhatsAppMessage): unknown[] {
  const parameters = message.params.map((text) => ({ type: 'text', text: templateParam(text) }))
  const body = { type: 'body', parameters }
  if (message.template !== 'verify') return [body]
  // An authentication template carries its code twice: in the body and on the "copy code" button.
  return [
    body,
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [parameters[0] ?? { type: 'text', text: '-' }],
    },
  ]
}

/** The code in Meta's error answer, if there is one: `{ error: { code } }`. */
function errorCode(body: Uint8Array | undefined): number | null {
  if (body === undefined) return null
  try {
    const parsed = JSON.parse(new TextDecoder().decode(body)) as { error?: { code?: unknown } }
    return typeof parsed.error?.code === 'number' ? parsed.error.code : null
  } catch {
    return null
  }
}

/**
 * The WhatsApp Cloud API, through the egress rules like every call that leaves the server. 2xx is
 * sent. Meta's "too fast" codes, 5xx, 401/403 (a token or number not set up yet) and no answer are
 * tried again; any other refusal (a number that is not on WhatsApp, a template that is not approved
 * or has the wrong variables) is refused for good, so a retry does not repeat it.
 */
export function cloudApi(options: CloudOptions): WhatsApp {
  const url = `https://graph.facebook.com/${options.version}/${encodeURIComponent(options.phoneNumberId)}/messages`
  return {
    available: true,
    async send(message) {
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: message.to.replace(/^\+/, ''),
        type: 'template',
        template: {
          name: WHATSAPP_TEMPLATES[message.template],
          language: { code: message.language },
          components: components(message),
        },
      }
      try {
        const fetched = await (options.fetcher ?? safeFetch)(url, {
          userAgent: USER_AGENT,
          accept: 'application/json',
          policy: options.policy,
          ...(options.resolver === undefined ? {} : { resolver: options.resolver }),
          timeoutMs: TIMEOUT_MS,
          maxBytes: MAX_BYTES,
          onTooLarge: 'truncate',
          json: payload,
          headers: { authorization: `Bearer ${options.accessToken}` },
        })
        const response = fetched.response
        const status = response?.status ?? null
        if (status !== null && status >= 200 && status < 300) return 'sent'
        const code = errorCode(response?.body)
        options.log?.(
          `WhatsApp answered ${status === null ? 'nothing' : String(status)}${code === null ? '' : ` (code ${String(code)})`}`,
        )
        if (status === 400 && (code === null || !RATE_CODES.has(code))) return 'rejected'
        return 'retry'
      } catch {
        options.log?.('WhatsApp could not be reached')
        return 'retry'
      }
    },
  }
}

export interface WhatsAppSettings {
  readonly phoneNumberId: string
  readonly accessToken: string
  readonly version: string
  /** Both set turn on the check Meta's webhook makes and the STOP reply. */
  readonly webhook: { readonly appSecret: string; readonly verifyToken: string } | null
}

/**
 * The settings of a provider that is on, or null. A provider that is named must be complete (the
 * sending number and the token): a half-set one stops the start rather than let the owner believe
 * alerts are sent. The webhook's two values come together or not at all.
 */
export function whatsappSettingsFrom(
  env: Readonly<Record<string, string | undefined>>,
): WhatsAppSettings | null {
  const provider = env[WHATSAPP_PROVIDER_VARIABLE]?.trim() ?? ''
  if (provider === '' || provider === 'off') return null
  if (provider !== 'cloud') {
    throw new Error(`${WHATSAPP_PROVIDER_VARIABLE}=${provider}: the only provider is cloud`)
  }
  const phoneNumberId = env[WHATSAPP_PHONE_ID_VARIABLE]?.trim() ?? ''
  if (!/^\d{5,25}$/.test(phoneNumberId)) {
    throw new Error(
      `${WHATSAPP_PHONE_ID_VARIABLE} must be the sending number's id (digits) with WhatsApp on`,
    )
  }
  const accessToken = env[WHATSAPP_TOKEN_VARIABLE]?.trim() ?? ''
  if (accessToken === '') throw new Error(`${WHATSAPP_TOKEN_VARIABLE} must be set with WhatsApp on`)
  const given = env[WHATSAPP_VERSION_VARIABLE]?.trim() ?? ''
  const version = given === '' ? DEFAULT_API_VERSION : given
  if (!/^v\d{1,3}\.\d{1,2}$/.test(version)) {
    throw new Error(`${WHATSAPP_VERSION_VARIABLE} must look like ${DEFAULT_API_VERSION}`)
  }
  const appSecret = env[WHATSAPP_APP_SECRET_VARIABLE]?.trim() ?? ''
  const verifyToken = env[WHATSAPP_VERIFY_TOKEN_VARIABLE]?.trim() ?? ''
  if ((appSecret === '') !== (verifyToken === '')) {
    throw new Error(
      `${WHATSAPP_APP_SECRET_VARIABLE} and ${WHATSAPP_VERIFY_TOKEN_VARIABLE} are set together or not at all`,
    )
  }
  return {
    phoneNumberId,
    accessToken,
    version,
    webhook: appSecret === '' ? null : { appSecret, verifyToken },
  }
}

export interface WhatsAppContext {
  readonly policy: EgressPolicy
  readonly resolver?: Resolver
  readonly fetcher?: typeof safeFetch
  readonly log?: (message: string) => void
}

/** The sender the environment names: off unless the provider is. */
export function whatsappFrom(
  env: Readonly<Record<string, string | undefined>>,
  context: WhatsAppContext,
): WhatsApp {
  const settings = whatsappSettingsFrom(env)
  if (settings === null) return noWhatsApp
  return cloudApi({
    phoneNumberId: settings.phoneNumberId,
    accessToken: settings.accessToken,
    version: settings.version,
    policy: context.policy,
    ...(context.resolver === undefined ? {} : { resolver: context.resolver }),
    ...(context.fetcher === undefined ? {} : { fetcher: context.fetcher }),
    ...(context.log === undefined ? {} : { log: context.log }),
  })
}

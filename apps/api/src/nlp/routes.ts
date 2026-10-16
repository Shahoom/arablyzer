import {
  NLP_CHECK_PATH,
  NLP_KINDS,
  NLP_SENSITIVITY,
  NLP_STATUS_PATH,
  NLP_TEXT_MAX,
  type NlpSensitivity,
  type NlpStatus,
  type ScanErrorCode,
} from '@arablyzer/api-contract/codes'
import type { NlpChecks } from '@arablyzer/store'
import type { Context, Hono, MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { ApiDeps } from '../app'
import { visitorScan } from '../take-scan'

/** The text tools' switch and how they reach the Arabic NLP service (through the worker). */
export interface NlpDeps {
  /** ARABLYZER_NLP_TEXT=1: the tools take pasted text. */
  readonly enabled: boolean
  /** The queue to the worker; absent, the tools answer that the service is away. */
  readonly checks?: NlpChecks
}

/** A request is a text of at most NLP_TEXT_MAX characters and a token: 4 characters each at most in UTF-8, with room. */
const MAX_BODY_BYTES = NLP_TEXT_MAX * 4 + 1024
/** Paragraphs the worker sends the service: a text is a page's worth, not a book. */
const MAX_PARAGRAPHS = 60

interface Helpers {
  readonly fromTheSiteJson: MiddlewareHandler
  readonly refuse: (c: Context, error: ScanErrorCode, retryAfterSeconds?: number) => Response
}

/** The paragraphs of a pasted text: its lines, trimmed, none empty. Null when nothing is left to check. */
export function paragraphsOf(text: string): string[] | null {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
  return lines.length === 0 || lines.length > MAX_PARAGRAPHS ? null : lines
}

/**
 * The Arabic text tools (M7): «المدقق الإملائي العربي» and «كاشف اللهجة» on a text a visitor pastes. Each
 * request is one scan of the visitor's quota; the text goes to the worker through the queue and is
 * kept nowhere. Off, the route is a 404 and `status` says so.
 */
export function mountNlp(app: Hono, deps: ApiDeps, helpers: Helpers, now: () => Date): void {
  const flags = deps.nlp
  const status: NlpStatus = { text: flags?.enabled === true }
  app.get(NLP_STATUS_PATH, (c) => c.json(status))
  if (flags?.enabled !== true) return
  const takeScan = visitorScan(deps, helpers, now)
  const limit = bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => helpers.refuse(c, 'bad-request'),
  })

  app.post(NLP_CHECK_PATH, helpers.fromTheSiteJson, limit, async (c) => {
    let request: Record<string, unknown> | null = null
    try {
      const raw: unknown = await c.req.json()
      if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
        request = raw as Record<string, unknown>
      }
    } catch {
      request = null
    }
    const asked = request?.kind
    const kind = NLP_KINDS.find((candidate) => candidate === asked)
    const wanted = request?.sensitivity
    const sensitivity: NlpSensitivity | undefined =
      wanted === undefined ? 'sure' : NLP_SENSITIVITY.find((candidate) => candidate === wanted)
    const text = request?.text
    if (
      request === null ||
      kind === undefined ||
      sensitivity === undefined ||
      typeof text !== 'string' ||
      text.length > NLP_TEXT_MAX
    ) {
      return helpers.refuse(c, 'bad-request')
    }
    const texts = paragraphsOf(text)
    if (texts === null || !/[ء-ي]{3}/u.test(text)) return helpers.refuse(c, 'bad-request')
    const refused = await takeScan(c, request.turnstileToken)
    if (refused !== null) return refused
    const result = await flags.checks?.check({ kind, texts, sensitivity })
    if (result?.ok !== true) return helpers.refuse(c, 'unavailable')
    return c.json(result.answer)
  })
}

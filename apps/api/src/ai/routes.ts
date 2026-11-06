import {
  AI_STATUS_PATH,
  AiFixRequest,
  SCAN_ID_PATTERN,
  type AiErrorCode,
  type AiErrorResponse,
  type AiFix,
  type AiStatus,
} from '@arablyzer/api-contract'
import type { ScanStore } from '@arablyzer/store'
import { quietly } from '@arablyzer/store'
import type { Context, Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { planOf, type SessionAccess } from '../accounts'
import { fromTheSite } from '../guards'
import type { Assistant } from './assistant'

export interface AiRouteDeps {
  readonly access: SessionAccess
  readonly assistant: Assistant
  readonly store: ScanStore
  readonly origin: string | undefined
  readonly log: ((message: string) => void) | undefined
}

/** A request is a rule's id and a language: 1 KB is ample. */
const MAX_BODY_BYTES = 1024
/** What a person waits when their suggestions are in progress: they may try again soon. */
const BUSY_SECONDS = 10

const STATUS: Readonly<Record<AiErrorCode, 400 | 401 | 403 | 404 | 422 | 429 | 502 | 503>> = {
  'bad-request': 400,
  unauthorized: 401,
  'not-found': 404,
  'plan-limit': 403,
  'rate-limited': 429,
  budget: 503,
  refused: 422,
  unavailable: 503,
  failed: 502,
}

/**
 * The fix assistant's two routes (BUILD-PLAN §12), mounted only where the deployment has a key. Both
 * are for a signed-in person alone: the assistant spends the owner's money, which a visitor with no
 * account has nothing to be counted against. What the model is shown is the stored report's, found
 * by the report's id; the request names a rule and a language and carries no text of its own.
 */
export function mountAi(app: Hono, deps: AiRouteDeps): void {
  const { access, assistant } = deps
  const told = quietly('Fix assistant', deps.log)
  const refuse = (
    c: Context,
    error: AiErrorCode,
    extra: Omit<AiErrorResponse, 'error'> = {},
  ): Response => {
    if (extra.retryAfterSeconds !== undefined) {
      c.header('Retry-After', String(extra.retryAfterSeconds))
    }
    const body: AiErrorResponse = { error, ...extra }
    return c.json(body, STATUS[error])
  }

  app.get(AI_STATUS_PATH, async (c) => {
    const read = await access.require(c)
    if (read instanceof Response) return read
    const plan = await planOf(access.plans, read.user.id)
    const body: AiStatus = {
      available: plan.aiFixesPerDay > 0,
      perDay: plan.aiFixesPerDay,
      used: plan.aiFixesPerDay > 0 ? await assistant.used(read.user.id) : 0,
    }
    return c.json(body)
  })

  app.post(
    '/api/reports/:id/fix',
    fromTheSite({
      origin: deps.origin,
      json: true,
      refuse: (c) => refuse(c, 'bad-request'),
      foreign: told,
    }),
    bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => refuse(c, 'bad-request') }),
    async (c) => {
      let raw: unknown
      try {
        raw = await c.req.json()
      } catch {
        return refuse(c, 'bad-request')
      }
      const request = AiFixRequest.safeParse(raw)
      if (!request.success) return refuse(c, 'bad-request')
      const read = await access.require(c)
      if (read instanceof Response) return read
      const id = c.req.param('id')
      const scan = SCAN_ID_PATTERN.test(id) ? await deps.store.get(id) : null
      if (scan?.report == null) return refuse(c, 'not-found')
      const plan = await planOf(access.plans, read.user.id)
      if (plan.aiFixesPerDay <= 0) {
        return refuse(c, 'plan-limit', { limit: 'aiFixesPerDay', plan: plan.id })
      }
      const result = await assistant.suggest({
        userId: read.user.id,
        perDay: plan.aiFixesPerDay,
        report: scan.report,
        ruleId: request.data.ruleId,
        language: request.data.language,
      })
      if (result.ok) {
        const fix: AiFix = {
          ruleId: request.data.ruleId,
          language: request.data.language,
          ...result.answer,
          cached: result.cached,
        }
        return c.json(fix)
      }
      switch (result.error) {
        case 'limit':
          return refuse(c, 'rate-limited', {
            retryAfterSeconds: result.retryAfterSeconds ?? BUSY_SECONDS,
          })
        case 'busy':
          return refuse(c, 'rate-limited', { retryAfterSeconds: BUSY_SECONDS })
        default:
          return refuse(c, result.error)
      }
    },
  )
}

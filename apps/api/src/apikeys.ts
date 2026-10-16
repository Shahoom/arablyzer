import {
  API_KEY_ID_PATTERN,
  API_KEYS_PATH,
  CreateApiKeyRequest,
  type ApiKeyCreated,
  type ApiKeysResponse,
  type ApiKeySummary,
} from '@arablyzer/api-contract'
import { quietly, type ApiKeyData, type ApiKeyRecord } from '@arablyzer/store'
import type { Context, Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { planOf, type AccountsDeps, type SessionAccess } from './accounts'
import { fromTheSite } from './guards'
import { newApiKey, newApiKeyId } from './ids'

export interface ApiKeysDeps {
  readonly access: SessionAccess
  readonly accounts: AccountsDeps
  readonly keys: ApiKeyData
  readonly origin: string | undefined
  readonly log: ((message: string) => void) | undefined
  readonly now: () => Date
}

const MAX_BODY_BYTES = 1024

export const keyOf = (key: ApiKeyRecord): ApiKeySummary => ({
  id: key.id,
  name: key.name,
  prefix: key.prefix,
  createdAt: key.createdAt.toISOString(),
  lastUsedAt: key.lastUsedAt === null ? null : key.lastUsedAt.toISOString(),
})

/**
 * The account's API keys (M5.1): list, make and revoke, behind the session and the site's Origin
 * guard like the account's other routes. The secret leaves in the answer to its creation and
 * nowhere else. A key that is not the caller's is a 404, as one that does not exist is.
 */
export function mountApiKeys(app: Hono, deps: ApiKeysDeps): void {
  const { access, keys } = deps
  const told = quietly('API keys', deps.log)
  const fromTheSiteJson = fromTheSite({
    origin: deps.origin,
    json: true,
    refuse: (c) => access.fail(c, 'bad-request'),
    foreign: told,
  })
  const fromTheSiteOnly = fromTheSite({
    origin: deps.origin,
    json: false,
    refuse: (c) => access.fail(c, 'bad-request'),
    foreign: told,
  })
  const refusal = (c: Context, limit: 'apiKeys' | 'api', plan: string) =>
    c.json({ error: 'plan-limit', limit, plan }, 403)

  app.get(API_KEYS_PATH, async (c) => {
    const read = await access.require(c)
    if (read instanceof Response) return read
    const plan = await planOf(access.plans, read.user.id)
    const body: ApiKeysResponse = {
      keys: (await keys.list(read.user.id)).map(keyOf),
      limit: plan.apiKeys,
      enabled: plan.apiScans !== 0,
    }
    return c.json(body)
  })

  app.post(
    API_KEYS_PATH,
    fromTheSiteJson,
    bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => access.fail(c, 'bad-request') }),
    async (c) => {
      let raw: unknown
      try {
        raw = await c.req.json()
      } catch {
        return access.fail(c, 'bad-request')
      }
      const request = CreateApiKeyRequest.safeParse(raw)
      if (!request.success) return access.fail(c, 'bad-request')
      const read = await access.require(c)
      if (read instanceof Response) return read
      const plan = await planOf(access.plans, read.user.id)
      if (plan.apiScans === 0) return refusal(c, 'api', plan.id)
      const made = newApiKey()
      const created = await keys.create(
        {
          id: newApiKeyId(),
          userId: read.user.id,
          name: request.data.name,
          prefix: made.prefix,
          hash: made.hash,
          createdAt: deps.now(),
        },
        plan.apiKeys,
      )
      if (created.kind === 'limit') return refusal(c, 'apiKeys', plan.id)
      const body: ApiKeyCreated = { key: keyOf(created.key), secret: made.secret }
      return c.json(body, 201)
    },
  )

  app.delete(`${API_KEYS_PATH}/:id`, fromTheSiteOnly, async (c) => {
    const read = await access.require(c)
    if (read instanceof Response) return read
    const id = c.req.param('id')
    const revoked = API_KEY_ID_PATTERN.test(id) && (await keys.revoke(read.user.id, id))
    return revoked ? c.body(null, 204) : access.fail(c, 'not-found')
  })
}

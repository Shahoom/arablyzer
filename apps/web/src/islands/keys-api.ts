import {
  API_KEYS_PATH,
  apiKeyPath,
  type ApiKeyCreated,
  type ApiKeysResponse,
} from '@arablyzer/api-contract/codes'
import type { KeysProblem } from '@arablyzer/i18n/developers'
import { isApiKeyCreated, isApiKeysResponse, keysProblemOf } from './keys-model'
import { jsonOf, request } from './sites-api'

/** The account page's requests about API keys (M5.1), on the same origin with the session cookie. */
export type KeysOutcome<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly problem: KeysProblem }

async function read<T>(
  response: Response | null,
  accept: (value: unknown) => value is T,
): Promise<KeysOutcome<T>> {
  if (response === null) return { ok: false, problem: 'network' }
  const body = await jsonOf(response)
  if (!response.ok) return { ok: false, problem: keysProblemOf(response.status, body) }
  return accept(body) ? { ok: true, value: body } : { ok: false, problem: 'unavailable' }
}

export function listKeys(send: typeof fetch = fetch): Promise<KeysOutcome<ApiKeysResponse>> {
  return request(send, 'GET', API_KEYS_PATH).then((r) => read(r, isApiKeysResponse))
}

export function createKey(
  name: string,
  send: typeof fetch = fetch,
): Promise<KeysOutcome<ApiKeyCreated>> {
  return request(send, 'POST', API_KEYS_PATH, { name }).then((r) => read(r, isApiKeyCreated))
}

export async function revokeKey(
  id: string,
  send: typeof fetch = fetch,
): Promise<KeysOutcome<null>> {
  const response = await request(send, 'DELETE', apiKeyPath(id))
  if (response === null) return { ok: false, problem: 'network' }
  if (response.ok) return { ok: true, value: null }
  return { ok: false, problem: keysProblemOf(response.status, await jsonOf(response)) }
}

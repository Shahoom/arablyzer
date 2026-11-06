import { AI_STATUS_PATH, aiFixPath, type AiFix, type AiStatus } from '@arablyzer/api-contract/codes'
import type { AiProblem } from '@arablyzer/i18n/ai'
import type { Lang } from '@arablyzer/seo/site'
import { aiProblemOf, isAiFix, isAiStatus } from './ai-model'
import { jsonOf, request } from './sites-api'

/** The report page's two requests about the fix assistant, on the same origin with the session cookie. */
export type AiOutcome<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly problem: AiProblem }

/**
 * Whether the assistant is there for this person: its status, or null for every other answer (no
 * assistant in this deployment, nobody signed in, the service away). The page shows nothing then.
 */
export async function readAiStatus(send: typeof fetch = fetch): Promise<AiStatus | null> {
  const response = await request(send, 'GET', AI_STATUS_PATH)
  if (response?.ok !== true) return null
  const body = await jsonOf(response)
  return isAiStatus(body) ? body : null
}

/** Asks for a suggested fix of one rule of the report. */
export async function askFix(
  reportId: string,
  ruleId: string,
  language: Lang,
  send: typeof fetch = fetch,
): Promise<AiOutcome<AiFix>> {
  const response = await request(send, 'POST', aiFixPath(reportId), { ruleId, language })
  if (response === null) return { ok: false, problem: 'network' }
  const body = await jsonOf(response)
  if (!response.ok) return { ok: false, problem: aiProblemOf(response.status, body) }
  return isAiFix(body) ? { ok: true, value: body } : { ok: false, problem: 'unavailable' }
}

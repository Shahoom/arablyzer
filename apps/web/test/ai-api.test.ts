import { describe, expect, it, vi } from 'vitest'
import { askFix, readAiStatus } from '../src/islands/ai-api'
import { aiProblemOf, isAiFix, isAiStatus } from '../src/islands/ai-model'

const FIX = {
  ruleId: 'img-alt',
  language: 'ar',
  explanation: 'أضف نصاً بديلاً.',
  steps: ['a', 'b'],
  patch: '<img alt="x">',
  confidence: 'high',
  cached: false,
}
const respond = (status: number, body: unknown) =>
  vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  )

describe('the fix assistant’s answers', () => {
  it('accepts what the API sends and nothing else', () => {
    expect(isAiStatus({ available: true, perDay: 5, used: 1 })).toBe(true)
    for (const bad of [
      null,
      {},
      { available: 'yes', perDay: 5, used: 1 },
      { available: true, perDay: -1, used: 0 },
      { available: true, perDay: 5.5, used: 0 },
    ]) {
      expect(isAiStatus(bad)).toBe(false)
    }
    expect(isAiFix(FIX)).toBe(true)
    for (const bad of [
      null,
      { ...FIX, language: 'fr' },
      { ...FIX, steps: [1] },
      { ...FIX, confidence: 'certain' },
      { ...FIX, cached: 'no' },
      { ...FIX, explanation: undefined },
    ]) {
      expect(isAiFix(bad)).toBe(false)
    }
  })

  it('names a problem by the API’s code, or by the status when the answer is not ours', () => {
    expect(aiProblemOf(403, { error: 'plan-limit', limit: 'aiFixesPerDay' })).toBe('plan-limit')
    expect(aiProblemOf(503, { error: 'budget' })).toBe('budget')
    expect(aiProblemOf(401, '<html>')).toBe('unauthorized')
    expect(aiProblemOf(429, null)).toBe('rate-limited')
    expect(aiProblemOf(502, { error: 'something else' })).toBe('unavailable')
  })
})

describe('the requests', () => {
  it('reads the status, and takes every other answer for “not here”', async () => {
    const ok = respond(200, { available: true, perDay: 3, used: 0 })
    expect(await readAiStatus(ok)).toEqual({ available: true, perDay: 3, used: 0 })
    expect(ok).toHaveBeenCalledWith('/api/ai', expect.objectContaining({ method: 'GET' }))
    expect(await readAiStatus(respond(404, { error: 'not-found' }))).toBeNull()
    expect(await readAiStatus(respond(401, { error: 'unauthorized' }))).toBeNull()
    expect(await readAiStatus(respond(200, { nonsense: true }))).toBeNull()
    expect(await readAiStatus(vi.fn(() => Promise.reject(new Error('offline'))))).toBeNull()
  })

  it('asks for a fix with the rule and the language alone, and reads the suggestion', async () => {
    const send = respond(200, FIX)
    const report = 'R'.repeat(22)
    expect(await askFix(report, 'img-alt', 'ar', send)).toEqual({ ok: true, value: FIX })
    const [path, init] = send.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe(`/api/reports/${report}/fix`)
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('same-origin')
    expect(JSON.parse(init.body as string)).toEqual({ ruleId: 'img-alt', language: 'ar' })
  })

  it('says why a suggestion did not come', async () => {
    const ask = (send: typeof fetch) => askFix('R'.repeat(22), 'img-alt', 'en', send)
    expect(await ask(respond(429, { error: 'rate-limited', retryAfterSeconds: 60 }))).toEqual({
      ok: false,
      problem: 'rate-limited',
    })
    expect(await ask(respond(422, { error: 'refused' }))).toEqual({ ok: false, problem: 'refused' })
    expect(await ask(respond(200, { odd: 1 }))).toEqual({ ok: false, problem: 'unavailable' })
    expect(await ask(vi.fn(() => Promise.reject(new Error('offline'))))).toEqual({
      ok: false,
      problem: 'network',
    })
  })
})

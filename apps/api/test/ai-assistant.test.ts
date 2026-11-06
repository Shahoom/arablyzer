import { AI_MAX_PATCH } from '@arablyzer/api-contract'
import { MemoryAiData } from '@arablyzer/store'
import { describe, expect, it } from 'vitest'
import { createAssistant, requestFor } from '../src/ai/assistant'
import { costMicro } from '../src/ai/cost'
import { cacheKey, evidenceOf, PROMPT_VERSION, SYSTEM_PROMPT } from '../src/ai/prompt'
import { aiSettingsFrom, toMicro, type AiSettings } from '../src/ai/settings'
import { createHash } from 'node:crypto'
import { ANSWER_SCHEMA } from '../src/ai/answer'
import { CASES } from './ai-cases'
import {
  answerJson,
  goodModel,
  messageOf,
  must,
  ruleReport,
  scriptedModel,
  type Script,
} from './support/ai'

const NOW = new Date('2026-10-09T12:00:00.000Z')
const SETTINGS: AiSettings = must(
  aiSettingsFrom({
    ANTHROPIC_API_KEY: 'sk-ant-test-key',
    ARABLYZER_AI_SPEND_MONTHLY: '50',
    ARABLYZER_AI_SPEND_DAILY: '5',
  }),
)

function setup(script: Script, settings: AiSettings = SETTINGS) {
  const data = new MemoryAiData()
  const model = scriptedModel(script)
  let clock = NOW
  let n = 0
  const logs: string[] = []
  const assistant = createAssistant({
    settings,
    data,
    client: model.client,
    newId: () => `req${String((n += 1))}`.padEnd(22, '_'),
    now: () => clock,
    log: (line) => logs.push(line),
  })
  return {
    assistant,
    data,
    model,
    logs,
    advance: (ms: number) => {
      clock = new Date(clock.getTime() + ms)
    },
  }
}

const report = ruleReport('img-alt', [{ message: 'No alt', snippet: '<img src="/a.png">' }])
const ask = (language: 'ar' | 'en' = 'en') => ({
  userId: 'ali'.padEnd(22, '_'),
  perDay: 3,
  report,
  ruleId: 'img-alt',
  language,
})
const good: Script = goodModel

describe('the prompt and the request are frozen', () => {
  it('holds the system prompt and the answer’s shape: change either, raise PROMPT_VERSION and run the live evaluation', () => {
    const fingerprint = createHash('sha256')
      .update(SYSTEM_PROMPT)
      .update(JSON.stringify(ANSWER_SCHEMA))
      .digest('hex')
    expect({ version: PROMPT_VERSION, fingerprint }).toMatchInlineSnapshot(`
      {
        "fingerprint": "582ec658fd2a0b536cd2ae7683c05acce1cf00fa3f0fb8ac4b779746048ebc94",
        "version": "1",
      }
    `)
  })

  it('asks for text only: no tool, no choice of one, no search, no thinking or sampling of its own', () => {
    const request = requestFor(SETTINGS, 'hello')
    expect(Object.keys(request).sort()).toEqual([
      'max_tokens',
      'messages',
      'model',
      'output_config',
      'system',
    ])
    expect(request.model).toBe('claude-opus-5-5')
    expect(request.system).toEqual([
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ])
    expect(request.output_config?.format).toEqual({ type: 'json_schema', schema: ANSWER_SCHEMA })
    expect(request.output_config?.effort).toBeUndefined()
    expect(requestFor({ ...SETTINGS, effort: 'low' }, 'x').output_config?.effort).toBe('low')
  })
})

describe('every case of the evaluation set', () => {
  it.each(CASES.map((c) => [c.name, c] as const))('%s', async (_name, spec) => {
    const { assistant, model, data } = setup(good)
    const result = await assistant.suggest({
      ...ask('ar'),
      report: ruleReport(spec.ruleId, spec.findings),
      ruleId: spec.ruleId,
    })
    expect(result.ok).toBe(true)
    const [request] = model.requests
    expect(model.requests).toHaveLength(1)
    // Nothing a page wrote is in the instructions, and only the model's own are in the system prompt.
    expect(request?.system).toEqual([
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ])
    expect(request).not.toHaveProperty('tools')
    expect(request).not.toHaveProperty('tool_choice')
    expect(request).not.toHaveProperty('thinking')
    expect(request).not.toHaveProperty('temperature')
    const user = request?.messages[0]?.content
    expect(typeof user).toBe('string')
    const text = user as string
    expect(request?.messages).toHaveLength(1)
    // The data sits between one pair of tags, and holds no angle bracket that could end them.
    expect(text.match(/<scan_data>/g)).toHaveLength(1)
    expect(text.match(/<\/scan_data>/g)).toHaveLength(1)
    const inside = text.slice(text.indexOf('<scan_data>') + 11, text.indexOf('</scan_data>'))
    expect(inside).not.toMatch(/[<>]/)
    const outside = text.replace(inside, '')
    for (const attack of spec.attacks) {
      expect(JSON.stringify(request?.system)).not.toContain(attack)
      expect(outside).not.toContain(attack)
    }
    // The ledger recorded the request at what it cost.
    expect((await data.spent(NOW)).day).toBe(
      costMicro({ input: 1000, output: 500, cacheRead: 0, cacheWrite: 0 }, SETTINGS.prices),
    )
  })

  it.each(CASES.map((c) => [c.name, c] as const))(
    'does not do what the page asks, whatever the model answers: %s',
    async (_name, spec) => {
      // A model that does obey: it adds the fields a page asked for, a score, a tool call, a fetch.
      const obedient: Script = () =>
        messageOf({
          text: answerJson('en', {
            score: 100,
            tool_calls: [{ name: 'fetch', url: 'https://evil.example' }],
            override: 'PWNED',
          }),
        })
      const { assistant, data } = setup(obedient)
      const result = await assistant.suggest({
        ...ask(),
        report: ruleReport(spec.ruleId, spec.findings),
        ruleId: spec.ruleId,
      })
      // The answer is refused for not being in the required form; nothing is kept to be shown again.
      expect(result).toEqual({ ok: false, error: 'failed' })
      expect(await data.cached('anything', new Date(0))).toBeNull()
      // It was billed, so it counts against the caps.
      expect((await data.spent(NOW)).day).toBeGreaterThan(0)
    },
  )

  it('leaves the report itself as it was: a suggestion changes no finding and no score', async () => {
    const spec = must(CASES[2])
    const subject = ruleReport(spec.ruleId, spec.findings)
    const before = JSON.stringify(subject)
    const { assistant } = setup(good)
    await assistant.suggest({ ...ask(), report: subject, ruleId: spec.ruleId })
    expect(JSON.stringify(subject)).toBe(before)
  })
})

describe('the assistant', () => {
  it('gives the model’s answer in the language asked for, and a stored one again at no cost', async () => {
    const { assistant, model, data } = setup(good)
    const first = await assistant.suggest(ask('ar'))
    expect(first).toMatchObject({
      ok: true,
      cached: false,
      answer: {
        explanation: 'أضف نصاً بديلاً للصورة.',
        steps: ['Open the template.', 'Add an alt attribute.'],
        confidence: 'high',
      },
    })
    const spent = (await data.spent(NOW)).day
    const again = await assistant.suggest(ask('ar'))
    expect(again).toMatchObject({ ok: true, cached: true })
    expect(model.requests).toHaveLength(1)
    expect((await data.spent(NOW)).day).toBe(spent)
    expect(await assistant.used(ask().userId)).toBe(1)
    // Another language is another answer; a changed finding is another one too.
    expect(await assistant.suggest(ask('en'))).toMatchObject({ ok: true, cached: false })
    expect(model.requests).toHaveLength(2)
    const changed = ruleReport('img-alt', [{ message: 'No alt', snippet: '<img src="/b.png">' }])
    expect(await assistant.suggest({ ...ask('en'), report: changed })).toMatchObject({
      cached: false,
    })
  })

  it('asks the model again when a stored answer cannot be read, or is a month old', async () => {
    const { assistant, model, data, advance } = setup(good)
    await assistant.suggest(ask())
    advance(31 * 86_400_000)
    expect(await assistant.suggest(ask())).toMatchObject({ ok: true, cached: false })
    expect(model.requests).toHaveLength(2)
    expect(data).toBeDefined()
  })

  it('does not trust a stored answer that is not in the form: it asks again', async () => {
    const { assistant, model, data } = setup(good)
    const evidence = must(evidenceOf(report, 'img-alt'))
    const key = cacheKey(evidence, 'en', SETTINGS.model)
    for (const damaged of ['not json', '{"explanation":""}', '{"explanation":"x","extra":1}']) {
      await data.cache(key, damaged, SETTINGS.model, NOW)
      const before = model.requests.length
      expect(await assistant.suggest(ask())).toMatchObject({ ok: true })
      expect(model.requests.length).toBe(before + 1)
    }
  })

  it('says not found for a rule that did not fail, without calling the model', async () => {
    const { assistant, model } = setup(good)
    expect(await assistant.suggest({ ...ask(), ruleId: 'no-such' })).toEqual({
      ok: false,
      error: 'not-found',
    })
    expect(model.requests).toHaveLength(0)
  })

  it('keeps an account to its plan’s day and says when to come back', async () => {
    const { assistant, model, advance } = setup(good)
    for (let n = 0; n < 3; n++) {
      const distinct = ruleReport('img-alt', [{ snippet: `<img src="/${String(n)}.png">` }])
      expect(await assistant.suggest({ ...ask(), report: distinct })).toMatchObject({ ok: true })
      advance(60_000)
    }
    const fourth = ruleReport('img-alt', [{ snippet: '<img src="/4.png">' }])
    const refused = await assistant.suggest({ ...ask(), report: fourth })
    expect(refused).toMatchObject({ ok: false, error: 'limit' })
    expect(model.requests).toHaveLength(3)
    if (!refused.ok) expect(refused.retryAfterSeconds).toBe(86_400 - 3 * 60)
  })

  it('holds the day’s spend: a request that could not fit is refused before the model is asked', async () => {
    // The cap is below what one request can cost at its worst.
    const tight = { ...SETTINGS, dailyCapMicro: toMicro(0.01) }
    const { assistant, model, logs } = setup(good, tight)
    expect(await assistant.suggest(ask())).toEqual({ ok: false, error: 'budget' })
    expect(model.requests).toHaveLength(0)
    expect(logs.join('\n')).not.toContain('sk-ant')
  })

  it('counts what a response really cost, caching included, not what was held for it', async () => {
    const usage = {
      input_tokens: 2000,
      output_tokens: 700,
      cache_read_input_tokens: 4000,
      cache_creation_input_tokens: 1000,
    }
    const { assistant, data } = setup(() => messageOf({ text: answerJson('en'), usage }))
    await assistant.suggest(ask())
    // 2000×4 + 700×20 + 4000×0.2 + 1000×5 micro-units at the default model's prices.
    expect((await data.spent(NOW)).day).toBe(8000 + 14_000 + 800 + 5000)
  })

  it('gives the place back when the model cannot be reached, and tells the page one word', async () => {
    const { assistant, data, logs } = setup(() => new Error('connect ECONNREFUSED sk-ant-test-key'))
    expect(await assistant.suggest(ask())).toEqual({ ok: false, error: 'unavailable' })
    expect(await assistant.used(ask().userId)).toBe(0)
    expect((await data.spent(NOW)).day).toBe(0)
    // What is told is a line of ours, never the error's own text, which could hold the key.
    expect(logs.join('\n')).not.toContain('ECONNREFUSED')
    expect(logs.join('\n')).not.toContain('sk-ant')
  })

  it('treats a refusal, a cut-off answer and an answer in the wrong form as failures that were billed', async () => {
    for (const [script, error] of [
      [() => messageOf({ stop: 'refusal' }), 'refused'],
      [() => messageOf({ text: '{"explanation_ar":"', stop: 'max_tokens' }), 'failed'],
      [() => messageOf({ text: 'Sure! Here is the fix.' }), 'failed'],
      [() => messageOf({ text: answerJson('en', { explanation_en: '' }) }), 'failed'],
      [() => messageOf({ text: answerJson('en', { confidence: 'certain' }) }), 'failed'],
      [() => messageOf({}), 'failed'],
    ] as const) {
      const { assistant, data } = setup(script)
      expect(await assistant.suggest(ask())).toEqual({ ok: false, error })
      expect((await data.spent(NOW)).day).toBeGreaterThan(0)
      expect(await assistant.used(ask().userId)).toBe(1)
    }
  })

  it('trims an answer to its limits and drops a patch that is too long to cut', async () => {
    const long = 'x'.repeat(AI_MAX_PATCH + 1)
    const { assistant } = setup(() =>
      messageOf({
        text: answerJson('en', {
          explanation_en: `  ${'e'.repeat(2000)}‮  `,
          steps: Array.from({ length: 12 }, (_, n) => `step ${String(n)}`),
          patch: long,
        }),
      }),
    )
    const result = await assistant.suggest(ask())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.answer.explanation.length).toBeLessThanOrEqual(1500)
    expect(result.answer.explanation).not.toContain('‮')
    expect(result.answer.steps).toHaveLength(8)
    expect(result.answer.patch).toBe('')
  })
})

import { describe, expect, it } from 'vitest'
import { aiSettingsFrom, DEFAULT_MODEL, DEFAULT_PRICES } from '../src/ai/settings'

const KEY = { ANTHROPIC_API_KEY: 'sk-ant-test-key', ARABLYZER_AI_SPEND_MONTHLY: '20' }

describe('the fix assistant’s settings', () => {
  it('is off without the key, whatever else is set', () => {
    expect(aiSettingsFrom({})).toBeUndefined()
    expect(aiSettingsFrom({ ANTHROPIC_API_KEY: '  ', ARABLYZER_AI_MODEL: '??' })).toBeUndefined()
    expect(
      aiSettingsFrom({ ARABLYZER_AI_SPEND_MONTHLY: 'lots', ARABLYZER_AI_EFFORT: 'x' }),
    ).toBeUndefined()
  })

  it('takes the default model with its published prices, and a monthly cap in micro-units', () => {
    expect(aiSettingsFrom(KEY)).toMatchObject({
      apiKey: 'sk-ant-test-key',
      model: DEFAULT_MODEL,
      prices: DEFAULT_PRICES,
      monthlyCapMicro: 20_000_000,
      dailyCapMicro: null,
      maxOutputTokens: 6000,
      effort: undefined,
      maxPending: 2,
    })
  })

  it('reads the owner’s choices', () => {
    expect(
      aiSettingsFrom({
        ...KEY,
        ARABLYZER_AI_SPEND_DAILY: '1.5',
        ARABLYZER_AI_EFFORT: 'low',
        ARABLYZER_AI_MAX_OUTPUT_TOKENS: '3000',
        ARABLYZER_AI_PRICE_OUTPUT: '18',
      }),
    ).toMatchObject({
      dailyCapMicro: 1_500_000,
      effort: 'low',
      maxOutputTokens: 3000,
      prices: { input: 4, output: 18, cacheRead: 0.2, cacheWrite: 5 },
    })
  })

  it('wants the prices of any other model, and derives the cache prices from the input price', () => {
    expect(() => aiSettingsFrom({ ...KEY, ARABLYZER_AI_MODEL: 'claude-haiku-5-5' })).toThrow(
      /PRICE_INPUT and ARABLYZER_AI_PRICE_OUTPUT/,
    )
    expect(
      aiSettingsFrom({
        ...KEY,
        ARABLYZER_AI_MODEL: 'claude-haiku-5-5',
        ARABLYZER_AI_PRICE_INPUT: '0.1',
        ARABLYZER_AI_PRICE_OUTPUT: '0.5',
      })?.prices,
    ).toEqual({ input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 })
  })

  it('refuses to start with the key but a mistake, naming the variable', () => {
    const bad = (extra: Record<string, string>, message: RegExp) => {
      expect(() => aiSettingsFrom({ ...KEY, ...extra })).toThrow(message)
    }
    expect(() => aiSettingsFrom({ ANTHROPIC_API_KEY: 'k' })).toThrow(/SPEND_MONTHLY/)
    bad({ ARABLYZER_AI_SPEND_MONTHLY: '0' }, /SPEND_MONTHLY/)
    bad({ ARABLYZER_AI_SPEND_MONTHLY: 'ten' }, /SPEND_MONTHLY/)
    bad({ ARABLYZER_AI_SPEND_DAILY: '21' }, /SPEND_DAILY/)
    bad({ ARABLYZER_AI_SPEND_DAILY: '0' }, /SPEND_DAILY/)
    bad({ ARABLYZER_AI_EFFORT: 'extreme' }, /EFFORT/)
    bad({ ARABLYZER_AI_MODEL: 'a b' }, /MODEL/)
    bad({ ARABLYZER_AI_PRICE_INPUT: '-1' }, /PRICE_INPUT/)
    bad({ ARABLYZER_AI_PRICE_OUTPUT: '0' }, /PRICE_OUTPUT/)
    bad({ ARABLYZER_AI_MAX_OUTPUT_TOKENS: '10' }, /MAX_OUTPUT_TOKENS/)
    bad({ ARABLYZER_AI_MAX_PENDING: '0' }, /MAX_PENDING/)
  })
})

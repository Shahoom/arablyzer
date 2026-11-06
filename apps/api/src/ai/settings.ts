/** The key of the Claude API. Unset (or empty), the fix assistant is off and nothing else here is read. */
export const ANTHROPIC_KEY_VARIABLE = 'ANTHROPIC_API_KEY'

/** The model the assistant asks unless the owner names another (ARABLYZER_AI_MODEL). */
export const DEFAULT_MODEL = 'claude-opus-5-5'

/**
 * What the default model costs, per million tokens, in the unit the caps are written in (US dollars
 * for the Claude API): input, output, a cache read, a cache write (a quarter more than input). From
 * the Claude API's published prices for `claude-opus-5-5`. Another model has no default: its prices
 * are the owner's to set, and the assistant does not start without them.
 */
export const DEFAULT_PRICES: Prices = Object.freeze({
  input: 4,
  output: 20,
  cacheRead: 0.2,
  cacheWrite: 5,
})

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type Effort = (typeof EFFORTS)[number]

/** Units per million tokens. */
export interface Prices {
  readonly input: number
  readonly output: number
  readonly cacheRead: number
  readonly cacheWrite: number
}

export interface AiSettings {
  readonly apiKey: string
  readonly model: string
  /** The most tokens one answer may use, thinking included. */
  readonly maxOutputTokens: number
  /** How hard the model works (ARABLYZER_AI_EFFORT); unset leaves the model's own default. */
  readonly effort: Effort | undefined
  readonly prices: Prices
  /** The caps, in micro-units (a millionth of the price unit); the month's is always there. */
  readonly dailyCapMicro: number | null
  readonly monthlyCapMicro: number
  /** The requests one account may have waiting for the model at once. */
  readonly maxPending: number
  /** How long one request to the model may take. */
  readonly timeoutMs: number
}

type Env = Readonly<Record<string, string | undefined>>

const DECIMAL = /^\d+(?:\.\d{1,6})?$/
const read = (env: Env, name: string): string => env[name]?.trim() ?? ''

function decimal(env: Env, name: string): number | undefined {
  const raw = read(env, name)
  if (raw === '') return undefined
  const value = Number(raw)
  if (!DECIMAL.test(raw) || !Number.isFinite(value)) {
    throw new Error(`${name} must be a number such as 4 or 0.25, not ${raw}`)
  }
  return value
}

function whole(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = read(env, name)
  if (raw === '') return fallback
  if (!/^\d+$/.test(raw) || Number(raw) < min || Number(raw) > max) {
    throw new Error(
      `${name} must be a whole number from ${String(min)} to ${String(max)}, not ${raw}`,
    )
  }
  return Number(raw)
}

/** A price, in units per million tokens, is more than 0. */
function price(env: Env, name: string): number | undefined {
  const value = decimal(env, name)
  if (value === 0) throw new Error(`${name} must be more than 0`)
  return value
}

/** A price at the six decimals prices are written to. */
const rounded = (value: number): number => Math.round(value * 1_000_000) / 1_000_000

/** Units to micro-units, whole: a cap is compared with costs counted in them. */
export const toMicro = (units: number): number => Math.round(units * 1_000_000)

/**
 * The assistant's settings from the environment, or undefined when the key is not set (the feature
 * is off, whatever else is). With the key set, every mistake is told at start: a model with no
 * prices, a malformed number, or no monthly cap, since an assistant with no limit to its spend is
 * never started.
 */
export function aiSettingsFrom(env: Env): AiSettings | undefined {
  const apiKey = read(env, ANTHROPIC_KEY_VARIABLE)
  if (apiKey === '') return undefined
  const model = read(env, 'ARABLYZER_AI_MODEL') || DEFAULT_MODEL
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,99}$/.test(model)) {
    throw new Error('ARABLYZER_AI_MODEL is not a model name')
  }
  const effort = read(env, 'ARABLYZER_AI_EFFORT')
  if (effort !== '' && !(EFFORTS as readonly string[]).includes(effort)) {
    throw new Error(`ARABLYZER_AI_EFFORT must be one of ${EFFORTS.join(', ')}, not ${effort}`)
  }

  const input = price(env, 'ARABLYZER_AI_PRICE_INPUT')
  const output = price(env, 'ARABLYZER_AI_PRICE_OUTPUT')
  const defaults = model === DEFAULT_MODEL ? DEFAULT_PRICES : undefined
  const base = { input: input ?? defaults?.input, output: output ?? defaults?.output }
  if (base.input === undefined || base.output === undefined) {
    throw new Error(
      `ARABLYZER_AI_MODEL=${model} needs ARABLYZER_AI_PRICE_INPUT and ARABLYZER_AI_PRICE_OUTPUT (units per million tokens): the spend cap is counted from them`,
    )
  }
  // A cache read costs a tenth of input and a write a quarter more (the Claude API's multipliers).
  const prices: Prices = {
    input: base.input,
    output: base.output,
    cacheRead:
      price(env, 'ARABLYZER_AI_PRICE_CACHE_READ') ??
      defaults?.cacheRead ??
      rounded(base.input * 0.1),
    cacheWrite:
      price(env, 'ARABLYZER_AI_PRICE_CACHE_WRITE') ??
      defaults?.cacheWrite ??
      rounded(base.input * 1.25),
  }

  const monthly = decimal(env, 'ARABLYZER_AI_SPEND_MONTHLY')
  if (monthly === undefined || monthly === 0) {
    throw new Error(
      'ARABLYZER_AI_SPEND_MONTHLY must be set with ANTHROPIC_API_KEY: the assistant does not run without a cap on its spend',
    )
  }
  const daily = decimal(env, 'ARABLYZER_AI_SPEND_DAILY')
  if (daily !== undefined && (daily === 0 || daily > monthly)) {
    throw new Error('ARABLYZER_AI_SPEND_DAILY must be more than 0 and not above the monthly cap')
  }
  return {
    apiKey,
    model,
    maxOutputTokens: whole(env, 'ARABLYZER_AI_MAX_OUTPUT_TOKENS', 6000, 1000, 32_000),
    effort: effort === '' ? undefined : (effort as Effort),
    prices,
    dailyCapMicro: daily === undefined ? null : toMicro(daily),
    monthlyCapMicro: toMicro(monthly),
    maxPending: whole(env, 'ARABLYZER_AI_MAX_PENDING', 2, 1, 10),
    timeoutMs: whole(env, 'ARABLYZER_AI_TIMEOUT_SECONDS', 60, 5, 110) * 1000,
  }
}

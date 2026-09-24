import { parseArgs } from 'node:util'
import { SEVERITY_ORDER, type Severity } from '@arablyzer/report-schema'
import { RULES } from '@arablyzer/rules'
import { langFromEnv, type Lang } from './i18n'

export interface CliOptions {
  readonly url: string
  readonly json: boolean
  readonly lang: Lang
  readonly ruleIds: readonly string[] | undefined
  readonly failOn: Severity | undefined
  readonly timeoutMs: number
  readonly allowPrivate: boolean
  readonly help: boolean
  readonly version: boolean
}

export class UsageError extends Error {}

/** BUILD-PLAN §11: 30 s per page load; safeFetch accepts at most 120 s. */
const DEFAULT_TIMEOUT_SECONDS = 30
const MAX_TIMEOUT_SECONDS = 120

export function parseCliArgs(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): CliOptions {
  let parsed: ReturnType<typeof parse>
  try {
    parsed = parse(argv)
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error))
  }
  const { values, positionals } = parsed
  const lang = values.lang ?? langFromEnv(env)
  if (!isLang(lang)) throw new UsageError(`--lang must be ar or en, not "${lang}"`)
  const base = {
    json: values.json,
    lang,
    allowPrivate: values['allow-private'],
    help: values.help,
    version: values.version,
  }
  if (values.help || values.version) {
    return { ...base, url: '', ruleIds: undefined, failOn: undefined, timeoutMs: 0 }
  }
  if (positionals.length !== 1) {
    throw new UsageError(positionals.length === 0 ? 'a URL is required' : 'give exactly one URL')
  }
  return {
    ...base,
    url: withScheme(positionals[0] ?? ''),
    ruleIds: values.rules === undefined ? undefined : ruleIds(values.rules),
    failOn: values['fail-on'] === undefined ? undefined : severity(values['fail-on']),
    timeoutMs: timeout(values.timeout),
  }
}

function parse(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      json: { type: 'boolean', default: false },
      lang: { type: 'string' },
      rules: { type: 'string' },
      'fail-on': { type: 'string' },
      timeout: { type: 'string' },
      'allow-private': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  })
}

function isLang(value: string): value is Lang {
  return value === 'ar' || value === 'en'
}

/** "example.com" → "https://example.com"; anything with a scheme is left for egress to judge. */
function withScheme(url: string): string {
  const trimmed = url.trim()
  if (trimmed === '') throw new UsageError('a URL is required')
  return trimmed.includes('://') ? trimmed : `https://${trimmed}`
}

function ruleIds(list: string): string[] {
  const ids = list
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '')
  if (ids.length === 0) throw new UsageError('--rules needs at least one rule id')
  const unknown = ids.filter((id) => !RULES.some((rule) => rule.id === id))
  if (unknown.length > 0) {
    throw new UsageError(
      `unknown rule id: ${unknown.join(', ')}\nKnown rules: ${RULES.map((rule) => rule.id).join(', ')}`,
    )
  }
  return ids
}

function severity(value: string): Severity {
  const match = SEVERITY_ORDER.find((level) => level === value)
  if (match === undefined) {
    throw new UsageError(`--fail-on must be one of ${SEVERITY_ORDER.join(', ')}, not "${value}"`)
  }
  return match
}

function timeout(value: string | undefined): number {
  if (value === undefined) return DEFAULT_TIMEOUT_SECONDS * 1000
  const seconds = Number(value)
  if (!/^\d+$/.test(value) || seconds < 1 || seconds > MAX_TIMEOUT_SECONDS) {
    throw new UsageError(
      `--timeout must be a whole number of seconds from 1 to ${MAX_TIMEOUT_SECONDS}`,
    )
  }
  return seconds * 1000
}

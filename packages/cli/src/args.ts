import { parseArgs } from 'node:util'
// The browser package's settings only: Playwright itself loads with --render, not here.
import {
  NEEDS_ISOLATION,
  NETWORK_ISOLATED_VARIABLE,
  networkIsolated,
} from '@arablyzer/browser/engines'
import { Engine, SEVERITY_ORDER, type Severity } from '@arablyzer/report-schema'
import { RULES } from '@arablyzer/rules'
import { langFromEnv, type Lang } from './i18n'

/** --render, --engines and --screenshots (M1.1). */
export interface RenderChoice {
  readonly engines: readonly Engine[]
  /** Where to write <engine>.png; null for no screenshots. */
  readonly screenshotsDir: string | null
  /** ARABLYZER_NETWORK_ISOLATED=1: the network here reaches nothing but the egress proxy. */
  readonly networkIsolated: boolean
}

export interface CliOptions {
  readonly url: string
  readonly json: boolean
  readonly lang: Lang
  readonly ruleIds: readonly string[] | undefined
  readonly failOn: Severity | undefined
  readonly timeoutMs: number
  readonly allowPrivate: boolean
  /** null: no browser, as in Phase 0. */
  readonly render: RenderChoice | null
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
    return { ...base, url: '', ruleIds: undefined, failOn: undefined, timeoutMs: 0, render: null }
  }
  if (positionals.length !== 1) {
    throw new UsageError(positionals.length === 0 ? 'a URL is required' : 'give exactly one URL')
  }
  const render = renderChoice(values.render, values.engines, values.screenshots, env)
  const ids = values.rules === undefined ? undefined : ruleIds(values.rules)
  if (render === null && ids !== undefined) {
    const needRender = ids.filter((id) =>
      RULES.some((rule) => rule.id === id && rule.needs.includes('render')),
    )
    if (needRender.length > 0) {
      throw new UsageError(
        `${needRender.join(', ')} need the page rendered in a browser: add --render`,
      )
    }
  }
  // Some rules read what only one engine reports (Chromium: the fonts that drew a text).
  for (const rule of RULES) {
    if (render === null || ids?.includes(rule.id) !== true) continue
    const readable = rule.renderEngines
    if (readable?.some((engine) => render.engines.includes(engine)) ?? true) continue
    throw new UsageError(
      `${rule.id} reads what only ${(readable ?? []).join(' or ')} reports: add it to --engines`,
    )
  }
  return {
    ...base,
    url: withScheme(positionals[0] ?? ''),
    ruleIds: ids,
    failOn: values['fail-on'] === undefined ? undefined : severity(values['fail-on']),
    timeoutMs: timeout(values.timeout),
    render,
  }
}

/** --engines or --screenshots imply --render; Chromium alone by default (Phase 1 decision 2). */
function renderChoice(
  render: boolean,
  engines: string | undefined,
  screenshots: string | undefined,
  env: Readonly<Record<string, string | undefined>>,
): RenderChoice | null {
  if (!render && engines === undefined && screenshots === undefined) return null
  if (screenshots?.trim() === '') throw new UsageError('--screenshots needs a directory')
  const isolated = networkIsolated(env)
  return {
    engines: engines === undefined ? ['chromium'] : engineList(engines, isolated),
    screenshotsDir: screenshots ?? null,
    networkIsolated: isolated,
  }
}

/**
 * The engines asked for. Engines that send traffic around the egress proxy (WebKit) run only
 * where the network is isolated (Phase 1 design §5): asked for by name elsewhere, they are a
 * usage error, and "all" leaves them out.
 */
function engineList(list: string, isolated: boolean): Engine[] {
  const names = list
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name !== '')
  if (names.length === 1 && names[0] === 'all') {
    return Engine.options.filter((engine) => isolated || !NEEDS_ISOLATION.includes(engine))
  }
  if (names.length === 0) throw new UsageError('--engines needs at least one engine')
  const engines: Engine[] = []
  for (const name of names) {
    const engine = Engine.options.find((option) => option === name)
    if (engine === undefined) {
      throw new UsageError(`unknown engine: ${name} (use ${Engine.options.join(', ')}, or all)`)
    }
    if (!isolated && NEEDS_ISOLATION.includes(engine)) {
      throw new UsageError(
        `${engine} sends WebRTC around the egress proxy, so it runs only in a container whose network reaches nothing but the proxy (set ${NETWORK_ISOLATED_VARIABLE}=1 there)`,
      )
    }
    if (!engines.includes(engine)) engines.push(engine)
  }
  return engines
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
      render: { type: 'boolean', default: false },
      engines: { type: 'string' },
      screenshots: { type: 'string' },
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

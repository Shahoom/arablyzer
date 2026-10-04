import { networkIsolated } from '@arablyzer/browser/engines'
import { dohUrlFrom, serverPolicy } from '@arablyzer/egress'
import { parseCredentials, type OutsideOptions, type ScanOptions } from '@arablyzer/engine'
import type { Engine } from '@arablyzer/report-schema'

const ENGINES: readonly Engine[] = ['chromium', 'firefox', 'webkit']

/**
 * The free scan's options, from the environment (M2.1 plan §4): the servers' address rules,
 * the three engines (ARABLYZER_ENGINES chooses fewer), WebKit only where the network is
 * isolated (ARABLYZER_NETWORK_ISOLATED), and the CrUX key when the owner gives one
 * (ARABLYZER_CRUX_KEY). Safe Browsing takes ARABLYZER_SAFE_BROWSING_KEY, or the CrUX key when
 * there is none: one Google key can allow both APIs. Knowledge Graph takes ARABLYZER_KG_KEY, or the
 * CrUX key likewise. Open PageRank takes ARABLYZER_OPR_KEY alone. Budgets are the plan's (§11), the engine's defaults. Behind the egress
 * proxy, which resolves every name, the TXT lookups of the DNS rules are DNS over HTTPS:
 * ARABLYZER_DOH_URL names the resolver, Cloudflare's by default (M2.3c review). A page's HTML is
 * read in a thread with a heap of its own, and a clock that ends it wherever it is (H1 of the
 * pre-launch review): a page too much for it is too complex, and never the end of this process.
 */
/**
 * What the tools that ask other services may use (docs/design/plans/arabic-native.md §9 to §14):
 * the look-alike domains and the PDFs need nothing; Google's suggestions only when the operator
 * turns them on with ARABLYZER_SUGGEST=1.
 */
export function outsideFrom(
  env: Readonly<Record<string, string | undefined>>,
): OutsideOptions | undefined {
  const outside: { -readonly [K in keyof OutsideOptions]: OutsideOptions[K] } = {}
  if (env.ARABLYZER_SUGGEST?.trim() === '1') outside.suggest = {}
  const key = (name: string) => env[name]?.trim() ?? ''
  const keys = {
    ...(key('ARABLYZER_OPENAI_KEY') === '' ? {} : { openai: key('ARABLYZER_OPENAI_KEY') }),
    ...(key('ARABLYZER_GEMINI_KEY') === '' ? {} : { gemini: key('ARABLYZER_GEMINI_KEY') }),
    ...(key('ARABLYZER_PERPLEXITY_KEY') === ''
      ? {}
      : { perplexity: key('ARABLYZER_PERPLEXITY_KEY') }),
    ...(key('ARABLYZER_ANTHROPIC_KEY') === '' ? {} : { anthropic: key('ARABLYZER_ANTHROPIC_KEY') }),
  }
  if (Object.keys(keys).length > 0) {
    const models = {
      ...(key('ARABLYZER_OPENAI_MODEL') === '' ? {} : { openai: key('ARABLYZER_OPENAI_MODEL') }),
      ...(key('ARABLYZER_GEMINI_MODEL') === '' ? {} : { gemini: key('ARABLYZER_GEMINI_MODEL') }),
      ...(key('ARABLYZER_ANTHROPIC_MODEL') === ''
        ? {}
        : { anthropic: key('ARABLYZER_ANTHROPIC_MODEL') }),
    }
    outside.aiVisibility = { keys, ...(Object.keys(models).length === 0 ? {} : { models }) }
  }
  const credentials = key('ARABLYZER_BIGQUERY_CREDENTIALS')
  const project = key('ARABLYZER_BIGQUERY_PROJECT')
  if ((credentials === '') !== (project === '')) {
    throw new Error(
      'ARABLYZER_BIGQUERY_CREDENTIALS and ARABLYZER_BIGQUERY_PROJECT are set together or not at all',
    )
  }
  if (credentials !== '') {
    const parsed = parseCredentials(credentials)
    if (parsed === null) {
      throw new Error(
        'ARABLYZER_BIGQUERY_CREDENTIALS must be a service account key (JSON, or base64 of it)',
      )
    }
    const maxBytes = Number(key('ARABLYZER_BIGQUERY_MAX_BYTES'))
    outside.cruxCountries = {
      credentials: parsed,
      project,
      ...(Number.isFinite(maxBytes) && maxBytes > 0 ? { maxBytes } : {}),
    }
  }
  return Object.keys(outside).length === 0 ? undefined : outside
}

export function scanOptionsFrom(env: Readonly<Record<string, string | undefined>>): ScanOptions {
  const listed = (env.ARABLYZER_ENGINES ?? ENGINES.join(','))
    .split(',')
    .map((engine) => engine.trim())
    .filter((engine) => engine !== '')
  const unknown = listed.filter((engine) => !(ENGINES as readonly string[]).includes(engine))
  if (unknown.length > 0 || listed.length === 0) {
    throw new Error(
      `ARABLYZER_ENGINES lists chromium, firefox or webkit, not ${unknown.join(', ')}`,
    )
  }
  const engines = ENGINES.filter((engine) => listed.includes(engine))
  const cruxKey = env.ARABLYZER_CRUX_KEY?.trim()
  const ownSafeBrowsingKey = env.ARABLYZER_SAFE_BROWSING_KEY?.trim()
  const safeBrowsingKey =
    ownSafeBrowsingKey === undefined || ownSafeBrowsingKey === '' ? cruxKey : ownSafeBrowsingKey
  const ownKgKey = env.ARABLYZER_KG_KEY?.trim()
  const kgKey = ownKgKey === undefined || ownKgKey === '' ? cruxKey : ownKgKey
  const oprKey = env.ARABLYZER_OPR_KEY?.trim()
  const policy = serverPolicy(env)
  const dohUrl = dohUrlFrom(env, policy)
  return {
    policy,
    isolateParse: {},
    ...(dohUrl === undefined ? {} : { dohUrl }),
    // The Arabic X-ray is for a whole scan: a tool's scan drops it (optionsFor).
    render: { engines, networkIsolated: networkIsolated(env), xray: true },
    ...(cruxKey === undefined || cruxKey === '' ? {} : { crux: { apiKey: cruxKey } }),
    ...(safeBrowsingKey === undefined || safeBrowsingKey === ''
      ? {}
      : { safeBrowsing: { apiKey: safeBrowsingKey } }),
    ...(kgKey === undefined || kgKey === '' ? {} : { knowledgeGraph: { apiKey: kgKey } }),
    ...(outsideFrom(env) === undefined ? {} : { outside: outsideFrom(env) }),
    // Always given, so a whole scan says when the key is missing.
    openPageRank: { apiKey: oprKey === '' ? undefined : oprKey },
  }
}

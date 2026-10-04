import { networkIsolated } from '@arablyzer/browser/engines'
import { dohUrlFrom, serverPolicy } from '@arablyzer/egress'
import type { ScanOptions } from '@arablyzer/engine'
import type { Engine } from '@arablyzer/report-schema'

const ENGINES: readonly Engine[] = ['chromium', 'firefox', 'webkit']

/**
 * The free scan's options, from the environment (M2.1 plan §4): the servers' address rules,
 * the three engines (ARABLYZER_ENGINES chooses fewer), WebKit only where the network is
 * isolated (ARABLYZER_NETWORK_ISOLATED), and the CrUX key when the owner gives one
 * (ARABLYZER_CRUX_KEY). Safe Browsing takes ARABLYZER_SAFE_BROWSING_KEY, or the CrUX key when
 * there is none: one Google key can allow both APIs. Budgets are the plan's (§11), the engine's defaults. Behind the egress
 * proxy, which resolves every name, the TXT lookups of the DNS rules are DNS over HTTPS:
 * ARABLYZER_DOH_URL names the resolver, Cloudflare's by default (M2.3c review). A page's HTML is
 * read in a thread with a heap of its own, and a clock that ends it wherever it is (H1 of the
 * pre-launch review): a page too much for it is too complex, and never the end of this process.
 */
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
  const policy = serverPolicy(env)
  const dohUrl = dohUrlFrom(env, policy)
  return {
    policy,
    isolateParse: {},
    ...(dohUrl === undefined ? {} : { dohUrl }),
    render: { engines, networkIsolated: networkIsolated(env) },
    ...(cruxKey === undefined || cruxKey === '' ? {} : { crux: { apiKey: cruxKey } }),
    ...(safeBrowsingKey === undefined || safeBrowsingKey === ''
      ? {}
      : { safeBrowsing: { apiKey: safeBrowsingKey } }),
  }
}

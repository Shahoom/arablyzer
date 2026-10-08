import { describe, expect, it } from 'vitest'
import { scanOptionsFrom } from '../src/options'

describe('scanOptionsFrom', () => {
  it('renders in the three engines, WebKit only where the network is isolated', () => {
    const options = scanOptionsFrom({})
    expect(options.render).toEqual({
      engines: ['chromium', 'firefox', 'webkit'],
      networkIsolated: false,
      xray: true,
    })
    expect(scanOptionsFrom({ ARABLYZER_NETWORK_ISOLATED: '1' }).render?.networkIsolated).toBe(true)
    expect(options.crux).toBeUndefined()
    expect(options.policy?.allowPrivate).toBe(false)
  })

  // H1 of the pre-launch review: a page whose tree outgrew the heap ended the scanner, and every
  // scan queued behind it failed. The scanner reads pages in a thread with a heap of its own.
  it('reads the page in a thread of its own, with its own heap', () => {
    expect(scanOptionsFrom({}).isolateParse).toEqual({})
  })

  it('takes fewer engines, in their order, and refuses one it does not know', () => {
    expect(scanOptionsFrom({ ARABLYZER_ENGINES: 'webkit, chromium' }).render?.engines).toEqual([
      'chromium',
      'webkit',
    ])
    expect(() => scanOptionsFrom({ ARABLYZER_ENGINES: 'chromium,edge' })).toThrow(/not edge/)
  })

  it('asks CrUX only with a key', () => {
    expect(scanOptionsFrom({ ARABLYZER_CRUX_KEY: 'key' }).crux).toEqual({ apiKey: 'key' })
    expect(scanOptionsFrom({ ARABLYZER_CRUX_KEY: ' ' }).crux).toBeUndefined()
  })

  it('asks Safe Browsing with its own key, or the CrUX key, and not without one', () => {
    const sb = (env: Record<string, string>) => scanOptionsFrom(env).safeBrowsing
    expect(sb({ ARABLYZER_SAFE_BROWSING_KEY: ' sb ', ARABLYZER_CRUX_KEY: 'crux' })).toEqual({
      apiKey: 'sb',
    })
    expect(sb({ ARABLYZER_CRUX_KEY: 'crux' })).toEqual({ apiKey: 'crux' })
    // Compose passes an empty variable when it is not set: the CrUX key is used then.
    expect(sb({ ARABLYZER_SAFE_BROWSING_KEY: '', ARABLYZER_CRUX_KEY: 'crux' })).toEqual({
      apiKey: 'crux',
    })
    expect(sb({ ARABLYZER_SAFE_BROWSING_KEY: ' ' })).toBeUndefined()
    expect(sb({})).toBeUndefined()
  })

  it('asks Knowledge Graph with its own key, or the CrUX key, and not without one', () => {
    const kg = (env: Record<string, string>) => scanOptionsFrom(env).knowledgeGraph
    expect(kg({ ARABLYZER_KG_KEY: ' kg ', ARABLYZER_CRUX_KEY: 'crux' })).toEqual({ apiKey: 'kg' })
    expect(kg({ ARABLYZER_KG_KEY: '', ARABLYZER_CRUX_KEY: 'crux' })).toEqual({ apiKey: 'crux' })
    expect(kg({})).toBeUndefined()
  })

  it('asks Open PageRank with its own key alone', () => {
    expect(scanOptionsFrom({ ARABLYZER_OPR_KEY: ' opr ' }).openPageRank).toEqual({ apiKey: 'opr' })
    // No key still gives the option, so a whole scan says the check is off.
    expect(scanOptionsFrom({ ARABLYZER_CRUX_KEY: 'crux' }).openPageRank).toEqual({
      apiKey: undefined,
    })
  })

  // M2.3c review: behind the egress proxy the scanner resolves no name of its own, so the TXT
  // lookups of its DNS rules are DNS over HTTPS (RFC 8484), asked through that proxy.
  it('asks DNS over HTTPS behind the egress proxy, of Cloudflare unless told another resolver', () => {
    const proxied = { ARABLYZER_EGRESS_PROXY: 'http://egress:4750' }
    expect(scanOptionsFrom(proxied).dohUrl).toBe('https://cloudflare-dns.com/dns-query')
    expect(
      scanOptionsFrom({ ...proxied, ARABLYZER_DOH_URL: 'https://dns.example.net/dns-query' })
        .dohUrl,
    ).toBe('https://dns.example.net/dns-query')
    expect(scanOptionsFrom({ ...proxied, ARABLYZER_DOH_URL: '  ' }).dohUrl).toBe(
      'https://cloudflare-dns.com/dns-query',
    )
  })

  it('asks DNS itself where there is no egress proxy, unless told a DoH resolver', () => {
    expect(scanOptionsFrom({}).dohUrl).toBeUndefined()
    expect(scanOptionsFrom({ ARABLYZER_DOH_URL: 'https://dns.example.net/dns-query' }).dohUrl).toBe(
      'https://dns.example.net/dns-query',
    )
  })

  it('refuses a resolver that is not https in production, or not a URL', () => {
    expect(() =>
      scanOptionsFrom({
        ARABLYZER_DOH_URL: 'http://dns.example.net/dns-query',
        NODE_ENV: 'production',
      }),
    ).toThrow(TypeError)
    expect(() => scanOptionsFrom({ ARABLYZER_DOH_URL: 'dns.example.net' })).toThrow(TypeError)
  })
})

describe('the services beside the site', () => {
  const key = JSON.stringify({ client_email: 'svc@p.iam.gserviceaccount.com', private_key: 'k' })

  it('are all off by default: nothing is given, so nothing is sent', () => {
    expect(scanOptionsFrom({}).outside).toBeUndefined()
    expect(
      scanOptionsFrom({ ARABLYZER_SUGGEST: '0', ARABLYZER_OPENAI_KEY: ' ' }).outside,
    ).toBeUndefined()
  })

  it('turn on one by one: Google’s suggestions, each assistant’s key, BigQuery', () => {
    expect(scanOptionsFrom({ ARABLYZER_SUGGEST: '1' }).outside).toEqual({ suggest: {} })
    expect(
      scanOptionsFrom({
        ARABLYZER_OPENAI_KEY: ' o ',
        ARABLYZER_ANTHROPIC_KEY: 'a',
        ARABLYZER_ANTHROPIC_MODEL: 'claude-x',
      }).outside,
    ).toEqual({
      aiVisibility: { keys: { openai: 'o', anthropic: 'a' }, models: { anthropic: 'claude-x' } },
    })
    const bigquery = scanOptionsFrom({
      ARABLYZER_BIGQUERY_CREDENTIALS: key,
      ARABLYZER_BIGQUERY_PROJECT: 'proj',
      ARABLYZER_BIGQUERY_MAX_BYTES: '1000000',
    }).outside?.cruxCountries
    expect(bigquery).toMatchObject({
      credentials: { clientEmail: 'svc@p.iam.gserviceaccount.com' },
      project: 'proj',
      maxBytes: 1_000_000,
    })
  })

  it('refuse BigQuery credentials without a project, or that are not a service account key', () => {
    expect(() => scanOptionsFrom({ ARABLYZER_BIGQUERY_CREDENTIALS: key })).toThrow(
      /together or not at all/,
    )
    expect(() => scanOptionsFrom({ ARABLYZER_BIGQUERY_PROJECT: 'p' })).toThrow(
      /together or not at all/,
    )
    expect(() =>
      scanOptionsFrom({ ARABLYZER_BIGQUERY_CREDENTIALS: 'nope', ARABLYZER_BIGQUERY_PROJECT: 'p' }),
    ).toThrow(/service account key/)
    // The error never repeats the key.
    try {
      scanOptionsFrom({
        ARABLYZER_BIGQUERY_CREDENTIALS: 'SECRETVALUE',
        ARABLYZER_BIGQUERY_PROJECT: 'p',
      })
    } catch (error) {
      expect(String(error)).not.toContain('SECRETVALUE')
    }
  })
})

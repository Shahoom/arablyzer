import { describe, expect, it } from 'vitest'
import { scanOptionsFrom } from '../src/options'

describe('scanOptionsFrom', () => {
  it('renders in the three engines, WebKit only where the network is isolated', () => {
    const options = scanOptionsFrom({})
    expect(options.render).toEqual({
      engines: ['chromium', 'firefox', 'webkit'],
      networkIsolated: false,
    })
    expect(scanOptionsFrom({ ARABLYZER_NETWORK_ISOLATED: '1' }).render?.networkIsolated).toBe(true)
    expect(options.crux).toBeUndefined()
    expect(options.policy?.allowPrivate).toBe(false)
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

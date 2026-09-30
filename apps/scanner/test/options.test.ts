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
})

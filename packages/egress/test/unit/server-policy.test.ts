import { describe, expect, it } from 'vitest'
import { classifyAddress, serverPolicy, type InterfaceMap } from '../../src/index'

// A server with a loopback, a private LAN address, and a public address of its own.
const INTERFACES: InterfaceMap = {
  lo: [{ address: '127.0.0.1', family: 'IPv4' }],
  eth0: [
    { address: '10.0.0.4', family: 'IPv4' },
    { address: '198.51.100.20', family: 'IPv4' },
  ],
}

const allowed = (address: string, env: Record<string, string>) =>
  classifyAddress(address, serverPolicy(env, INTERFACES)).allowed

describe('serverPolicy', () => {
  it("refuses private ranges and the server's own addresses, and opens public ones", () => {
    expect(allowed('93.184.215.14', {})).toBe(true)
    expect(allowed('198.51.100.20', {})).toBe(false)
    expect(allowed('10.0.0.4', {})).toBe(false)
    expect(allowed('172.17.0.2', {})).toBe(false)
    expect(allowed('169.254.169.254', {})).toBe(false)
  })

  it('refuses what ARABLYZER_DENY_CIDRS names, such as a public address behind NAT', () => {
    const env = { ARABLYZER_DENY_CIDRS: '93.184.215.7/32, 2a00:1450::/32' }
    expect(allowed('93.184.215.7', env)).toBe(false)
    expect(allowed('93.184.215.8', env)).toBe(true)
    expect(() => serverPolicy({ ARABLYZER_DENY_CIDRS: 'not-a-cidr' }, INTERFACES)).toThrow(
      /Invalid deny CIDR/,
    )
  })

  it('opens private ranges for development only, and never its own public address', () => {
    const env = { ARABLYZER_ALLOW_PRIVATE: '1' }
    expect(allowed('10.0.0.9', env)).toBe(true)
    expect(allowed('198.51.100.20', env)).toBe(false)
    expect(allowed('169.254.169.254', env)).toBe(false)
    expect(() => serverPolicy({ ...env, NODE_ENV: 'production' }, INTERFACES)).toThrow(
      /never in production/,
    )
  })
})

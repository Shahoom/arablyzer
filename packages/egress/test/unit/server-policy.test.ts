import { describe, expect, it } from 'vitest'
import {
  checkDenyCidrs,
  classifyAddress,
  denyCidr,
  denyCidrsFrom,
  serverPolicy,
  type InterfaceMap,
} from '../../src/index'

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

describe('serverPolicy and ARABLYZER_DENY_CIDRS in IPv6', () => {
  it("refuses the server's own IPv6 address as it does its IPv4 one", () => {
    const env = { ARABLYZER_DENY_CIDRS: '93.184.215.7/32, 2a01:4f8:c17:1234::1/128' }
    expect(allowed('93.184.215.7', env)).toBe(false)
    expect(allowed('2a01:4f8:c17:1234::1', env)).toBe(false)
    // In any of its spellings, and through the IPv4 an IPv6 address carries.
    expect(allowed('2A01:4F8:C17:1234:0:0:0:1', env)).toBe(false)
    expect(allowed('2a01:4f8:c17:1234::2', env)).toBe(true)
    expect(allowed('::ffff:93.184.215.7', env)).toBe(false)
  })

  it("refuses the host's whole IPv6 prefix when that is what it is given", () => {
    const env = { ARABLYZER_DENY_CIDRS: '2a01:4f8:c17:1234::/64' }
    expect(allowed('2a01:4f8:c17:1234:ffff:ffff:ffff:ffff', env)).toBe(false)
    expect(allowed('2a01:4f8:c17:1235::1', env)).toBe(true)
  })
})

describe('denyCidr', () => {
  it('takes an address and its prefix, IPv4 or IPv6, and gives the entry back', () => {
    for (const entry of [
      '203.0.113.7/32',
      '93.184.215.0/24',
      '10.0.0.0/8',
      '2001:db8::7/128',
      '2a01:4f8:c17:1234::/64',
      '2A01:4F8::1/128',
      '::1/128',
      '1::/16',
      '2001:db8:0:0:0:0:0:7/128',
    ]) {
      expect(denyCidr(entry)).toBe(entry)
    }
  })

  it('refuses an address with no prefix, and tells how to write one', () => {
    expect(() => denyCidr('203.0.113.7')).toThrow(
      /Invalid deny CIDR: 203\.0\.113\.7 .*203\.0\.113\.7\/32/,
    )
    expect(() => denyCidr('2001:db8::7')).toThrow(/2001:db8::7\/128/)
    expect(() => denyCidr('203.0.113.7/')).toThrow(/prefix/)
  })

  // ipaddr.js takes these; the egress proxy's Go refuses them, and the two must agree.
  it('refuses the spellings that one reader takes for another range', () => {
    for (const entry of [
      '203.0.113/24',
      '203.0.0.113/24 ',
      '0x7f.1/8',
      '010.0.0.1/8',
      '203.000.113.007/32',
      '1.2.3.256/32',
      '1.2.3.4.5/32',
      'fe80::1%eth0/64',
      '[2001:db8::7]/128',
      '2001:db8::7 /128',
      'server.example/32',
      'not-a-cidr',
      '/32',
      '',
    ]) {
      expect(() => denyCidr(entry), JSON.stringify(entry)).toThrow(/Invalid deny CIDR/)
    }
  })

  it('refuses a prefix out of range, or not written as a plain number', () => {
    for (const entry of [
      '203.0.113.7/33',
      '2001:db8::7/129',
      '203.0.113.7/-1',
      '203.0.113.7/032',
      '203.0.113.7/3x',
      '203.0.113.7/ 32',
      '203.0.113.7/32/8',
      '203.0.113.7/1000',
    ]) {
      expect(() => denyCidr(entry), entry).toThrow(/Invalid deny CIDR/)
    }
  })

  it('refuses an IPv4 address written as IPv6, which the egress proxy does not match', () => {
    expect(() => denyCidr('::ffff:203.0.113.7/128')).toThrow(/write an IPv4 address as IPv4/)
    expect(() => denyCidr('::FFFF:cb00:7107/128')).toThrow(/write an IPv4 address as IPv4/)
  })
})

describe('denyCidrsFrom', () => {
  it('reads a comma-separated list, trimmed, without its empty entries', () => {
    expect(denyCidrsFrom(' 203.0.113.7/32 , ,2001:db8::7/128,')).toEqual([
      '203.0.113.7/32',
      '2001:db8::7/128',
    ])
    expect(denyCidrsFrom(undefined)).toEqual([])
    expect(denyCidrsFrom(' , ')).toEqual([])
  })

  it('names the entry that is not a CIDR, and no other', () => {
    expect(() => denyCidrsFrom('203.0.113.7/32, 198.51.100.9')).toThrow(/198\.51\.100\.9/)
    expect(() => serverPolicy({ ARABLYZER_DENY_CIDRS: '203.0.113/24' }, INTERFACES)).toThrow(
      /Invalid deny CIDR: 203\.0\.113\/24/,
    )
  })
})

describe('checkDenyCidrs', () => {
  it("passes the server's own public addresses, IPv4 and IPv6, without a word", () => {
    expect(checkDenyCidrs('93.184.215.7/32, 2a01:4f8:c17:1234::1/128')).toEqual({
      cidrs: ['93.184.215.7/32', '2a01:4f8:c17:1234::1/128'],
      warnings: [],
    })
  })

  it('needs at least one range', () => {
    for (const value of [undefined, '', '  ', ' , ,']) {
      expect(() => checkDenyCidrs(value)).toThrow(/ARABLYZER_DENY_CIDRS must name the server's own/)
    }
  })

  it('refuses an entry that is not a CIDR, and a prefix of 0, which refuses every address', () => {
    expect(() => checkDenyCidrs('93.184.215.7')).toThrow(/Invalid deny CIDR/)
    expect(() => checkDenyCidrs('93.184.215.7/32, 0.0.0.0/0')).toThrow(/refuses every address/)
    expect(() => checkDenyCidrs('::/0')).toThrow(/refuses every address/)
  })

  it('warns when there is no IPv6 range, where a name could point at the host’s IPv6 address', () => {
    const { warnings } = checkDenyCidrs('93.184.215.7/32')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/names no IPv6 range.*2001:db8::7\/128/)
  })

  it('warns when no range is a public address, since the private ones are refused already', () => {
    const { warnings } = checkDenyCidrs('192.168.1.10/32, 10.0.0.0/8, fd00::/8')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/names no public address/)
    expect(checkDenyCidrs('192.168.1.10/32').warnings).toHaveLength(2)
    // The documentation ranges are refused anyway, too.
    expect(checkDenyCidrs('203.0.113.7/32, 2001:db8::7/128').warnings).toHaveLength(1)
  })
})

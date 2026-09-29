import type { DnsFacts } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const txtNames = (domain: string) => [rule.txtName?.(domain) ?? '']

/** The page's domain with these TXT records at its _dmarc name. */
const withRecords = (...records: string[]) => {
  const dns: DnsFacts = {
    domain: 'shop.example',
    txt: [
      { name: '_dmarc.shop.example', outcome: records.length === 0 ? 'none' : 'found', records },
    ],
  }
  return { page: htmlPage('<p>نص</p>', { url: 'https://www.shop.example/' }), dns }
}

describe('dmarc-missing', () => {
  it("reads the TXT records at the _dmarc name of the page's organizational domain", () => {
    expect(rule.needs).toEqual(['dns'])
    expect(rule.txtName?.('shop.example')).toBe('_dmarc.shop.example')
  })

  it('fires when no record there has the version tag v=DMARC1', async () => {
    // "v=dmarc1": the version must match precisely (RFC 7489 §6.3).
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong', txtNames))).toEqual([
      { message: 'missing', values: { domain: 'shop.example' }, key: 'shop.example' },
    ])
    expect(detectAll(rule, withRecords())).toMatchObject([{ message: 'missing' }])
  })

  it('fires when there is more than one, which ends policy discovery (RFC 7489 §6.6.3)', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong-several', txtNames))).toEqual([
      {
        message: 'several',
        values: { domain: 'shop.example', count: 2 },
        snippet: 'v=DMARC1; p=none; rua=mailto:dmarc@shop.example | v=DMARC1; p=quarantine',
        key: 'shop.example',
      },
    ])
  })

  it('passes one DMARC record, whatever its policy', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right', txtNames))).toEqual([])
  })

  it('reads the version tag as RFC 7489 §6.4 writes it: first, v, =, then DMARC1 exactly', () => {
    for (const record of [
      'v=DMARC1; p=reject',
      'v=DMARC1;p=none',
      'V = DMARC1 ; p=quarantine',
      'v=DMARC1',
      'v=DMARC1\t;\tp=none',
    ]) {
      expect(detectAll(rule, withRecords(record)), record).toEqual([])
    }
    for (const record of [
      'v=dmarc1; p=reject',
      'v=DMARC2; p=reject',
      'v=DMARC10; p=reject',
      'p=reject; v=DMARC1',
      ' v=DMARC1; p=reject',
      'v=spf1 -all',
    ]) {
      expect(detectAll(rule, withRecords(record)), record).toMatchObject([{ message: 'missing' }])
    }
  })

  it('does not apply to a page whose domain was not looked up', () => {
    expect(applies(rule, { page: htmlPage('<p>نص</p>') })).toBe(false)
    expect(applies(rule, withRecords('v=DMARC1; p=none'))).toBe(true)
  })
})

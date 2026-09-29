import type { DnsFacts } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const txtNames = (domain: string) => [rule.txtName?.(domain) ?? '']

/** The page's domain with these TXT records at its own name. */
const withRecords = (...records: string[]) => {
  const dns: DnsFacts = {
    domain: 'shop.example',
    txt: [{ name: 'shop.example', outcome: records.length === 0 ? 'none' : 'found', records }],
  }
  return { page: htmlPage('<p>نص</p>', { url: 'https://shop.example/' }), dns }
}

describe('spf-missing', () => {
  it("reads the TXT records at the page's organizational domain itself", () => {
    expect(rule.needs).toEqual(['dns'])
    expect(rule.txtName?.('shop.example')).toBe('shop.example')
  })

  it('fires when none of the TXT records is an SPF record', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong', txtNames))).toEqual([
      { message: 'missing', values: { domain: 'shop.example' }, key: 'shop.example' },
    ])
    // No TXT records at all, or no such name: no SPF record either (RFC 7208 §4.3).
    expect(detectAll(rule, withRecords())).toMatchObject([{ message: 'missing' }])
  })

  it('fires when there is more than one, which receivers read as an error (RFC 7208 §4.5)', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong-several', txtNames))).toEqual([
      {
        message: 'several',
        values: { domain: 'shop.example', count: 2 },
        snippet: 'v=spf1 include:_spf.google.com ~all | v=spf1 include:mail.zendesk.com ~all',
        key: 'shop.example',
      },
    ])
  })

  it('passes one SPF record among the TXT records', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right', txtNames))).toEqual([])
  })

  it('reads the version as RFC 7208 §4.5 does: exactly v=spf1, then a space or the end', () => {
    for (const record of ['v=spf1 -all', 'v=spf1', 'V=SPF1 include:_spf.example.net ~all']) {
      expect(detectAll(rule, withRecords(record)), record).toEqual([])
    }
    for (const record of [
      'v=spf10 -all',
      'v=spf1-all',
      ' v=spf1 -all',
      'spf1 -all',
      'v=spf2.0/pra -all',
    ]) {
      expect(detectAll(rule, withRecords(record)), record).toMatchObject([{ message: 'missing' }])
    }
  })

  it('does not apply to a page whose domain was not looked up', () => {
    expect(applies(rule, { page: htmlPage('<p>نص</p>') })).toBe(false)
    expect(applies(rule, withRecords('v=spf1 -all'))).toBe(true)
  })
})

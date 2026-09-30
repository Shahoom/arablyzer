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

  it('fires when the one record has a version tag and no policy', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong-no-policy', txtNames))).toEqual([
      {
        message: 'no-policy',
        values: { domain: 'shop.example' },
        snippet: 'v=DMARC1; rua=mailto:dmarc@shop.example',
        key: 'shop.example',
      },
    ])
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

  // M2.3c review: a DMARC record has a p tag whose value is none, quarantine or reject (RFC 7489
  // §6.3: REQUIRED for policy records); without it the record does not say what to do.
  it('fires when the record has no p tag', () => {
    for (const record of [
      'v=DMARC1',
      'v=DMARC1;',
      'v=DMARC1; ',
      'v=DMARC1; rua=mailto:dmarc@shop.example',
      'v=DMARC1; sp=reject; pct=100',
      'v=DMARC1; policy=reject',
    ]) {
      expect(detectAll(rule, withRecords(record)), record).toEqual([
        {
          message: 'no-policy',
          values: { domain: 'shop.example' },
          snippet: record,
          key: 'shop.example',
        },
      ])
    }
  })

  it('fires when the p tag is anything but none, quarantine or reject', () => {
    for (const [record, value] of [
      ['v=DMARC1; p=bogus', 'bogus'],
      ['v=DMARC1; p=', ''],
      ['v=DMARC1; p=rejected; rua=mailto:dmarc@shop.example', 'rejected'],
      ['v=DMARC1; p=none none', 'none none'],
      ['v=DMARC1; p="reject"', '"reject"'],
    ] as const) {
      expect(detectAll(rule, withRecords(record)), record).toEqual([
        {
          message: 'bad-policy',
          values: { domain: 'shop.example', value },
          snippet: record,
          key: 'shop.example',
        },
      ])
    }
  })

  it('takes the policy in any case, with spaces, wherever among the tags it stands', () => {
    for (const record of [
      'v=DMARC1; p=NONE',
      'v=DMARC1; P = Quarantine ; rua=mailto:dmarc@shop.example',
      'v=DMARC1; rua=mailto:dmarc@shop.example; p=reject',
      'v=DMARC1;p=none;',
      'v=DMARC1;\tp=reject\t;',
      // The subdomain policy and the other tags are not checked.
      'v=DMARC1; p=none; sp=bogus; pct=x',
    ]) {
      expect(detectAll(rule, withRecords(record)), record).toEqual([])
    }
  })

  // The grammar (RFC 7489 §6.4) puts a ; after v=DMARC1. Without it the v tag's value is not
  // DMARC1, and a receiver does not take the record for one.
  it('says a record that starts v=DMARC1 with no ; after it is not written as the RFC asks', () => {
    for (const record of ['v=DMARC1 p=none', 'v=DMARC1\tp=reject; rua=mailto:x@shop.example']) {
      expect(detectAll(rule, withRecords(record)), record).toEqual([
        {
          message: 'malformed',
          values: { domain: 'shop.example' },
          snippet: record,
          key: 'shop.example',
        },
      ])
    }
    // A record that is not written for DMARC at all is not a near miss.
    for (const record of ['v=DMARC10 p=none', 'v=DMARC1p=none', 'v=DMARC1;p=none extra=1 p2']) {
      const found = detectAll(rule, withRecords(record))
      expect(
        found.map((finding) => finding.message),
        record,
      ).not.toContain('malformed')
    }
  })

  it('reads a well-formed record beside a malformed one as the one record it is', () => {
    expect(detectAll(rule, withRecords('v=DMARC1 p=none', 'v=DMARC1; p=reject'))).toEqual([])
    expect(
      detectAll(rule, withRecords('v=DMARC1 p=none', 'v=DMARC1; rua=mailto:a@b.c')),
    ).toMatchObject([{ message: 'no-policy' }])
  })

  it('counts records that start with the version tag for several, whatever their policy', () => {
    expect(
      detectAll(rule, withRecords('v=DMARC1; p=none', 'v=DMARC1; p=reject', 'v=DMARC1 p=none')),
    ).toMatchObject([{ message: 'several', values: { count: 2 } }])
  })

  it('does not apply to a page whose domain was not looked up', () => {
    expect(applies(rule, { page: htmlPage('<p>نص</p>') })).toBe(false)
    expect(applies(rule, withRecords('v=DMARC1; p=none'))).toBe(true)
  })
})

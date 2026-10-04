import { describe, expect, it } from 'vitest'
import { collectSafeBrowsing } from '../src/safe-browsing'

const match = (threatType: string, url = 'https://bad.example/') => ({
  threatType,
  platformType: 'ANY_PLATFORM',
  threatEntryType: 'URL',
  threat: { url },
})

describe('collectSafeBrowsing', () => {
  it('reads an empty answer as clean', () => {
    expect(collectSafeBrowsing({ status: 200, body: {} })).toEqual({
      outcome: 'clean',
      threats: [],
    })
  })

  it('reads each threat type once, in a fixed order, with the URL Google listed', () => {
    const body = {
      matches: [
        match('SOCIAL_ENGINEERING', 'https://bad.example/'),
        match('MALWARE', 'https://bad.example/x'),
        match('MALWARE', 'https://bad.example/y'),
      ],
    }
    expect(collectSafeBrowsing({ status: 200, body })).toEqual({
      outcome: 'flagged',
      threats: [
        { type: 'MALWARE', url: 'https://bad.example/x' },
        { type: 'SOCIAL_ENGINEERING', url: 'https://bad.example/' },
      ],
    })
  })

  it('is a failure, not a verdict, for a refusal, an error or an answer of another shape', () => {
    expect(collectSafeBrowsing({ status: 403, body: {} })).toEqual({
      outcome: 'failed',
      refused: true,
      threats: [],
    })
    expect(collectSafeBrowsing({ status: 500, body: {} }).outcome).toBe('failed')
    expect(collectSafeBrowsing({ status: null, body: null }).outcome).toBe('failed')
    expect(collectSafeBrowsing({ status: 200, body: 'ok' }).outcome).toBe('failed')
    expect(collectSafeBrowsing({ status: 200, body: { matches: 'x' } }).outcome).toBe('failed')
    expect(
      collectSafeBrowsing({ status: 200, body: { matches: [match('THREAT_TYPE_UNSPECIFIED')] } })
        .outcome,
    ).toBe('failed')
  })
})

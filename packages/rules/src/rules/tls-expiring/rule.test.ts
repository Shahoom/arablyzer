import { describe, expect, it } from 'vitest'
import { applies, detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const CHECKED = '2026-09-27T12:00:00.000Z'
const DAY = 86_400_000

/** A certificate `lifetime` days long with `left` days to run when checked. */
function certified(lifetime: number, left: number) {
  const now = Date.parse(CHECKED)
  return evidenceOf(
    htmlPage('<p>نص</p>', {
      url: 'https://shop.example/',
      certificate: {
        validFrom: new Date(now - (lifetime - left) * DAY).toISOString(),
        validTo: new Date(now + left * DAY).toISOString(),
        checkedAt: CHECKED,
      },
    }),
  )
}

describe('tls-expiring', () => {
  it('fires on a certificate with 10 of its 90 days left', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong'))).toMatchObject([
      { message: 'expiring' },
    ])
    expect(detectAll(rule, certified(90, 10))).toEqual([
      { message: 'expiring', values: { days: 10, date: '2026-10-07' } },
    ])
  })

  it('passes a certificate with 60 days left', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right'))).toEqual([])
    expect(detectAll(rule, certified(90, 14))).toEqual([])
  })

  it('judges a short-lived certificate by a third of its lifetime', () => {
    expect(detectAll(rule, certified(6, 5))).toEqual([])
    expect(detectAll(rule, certified(6, 1.5))).toMatchObject([
      { message: 'expiring', values: { days: 1 } },
    ])
  })

  it('says when the certificate had already run out', () => {
    expect(detectAll(rule, certified(90, -1))).toEqual([
      { message: 'expired', values: { date: '2026-09-26' } },
    ])
  })

  it('applies only to pages that came with a certificate', () => {
    expect(applies(rule, evidenceOf(htmlPage('<p>نص</p>', { url: 'http://shop.example/' })))).toBe(
      false,
    )
  })
})

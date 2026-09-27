import { describe, expect, it } from 'vitest'
import { applies, detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

describe('https-missing', () => {
  it('fires on a public page served over HTTP', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong'))).toEqual([
      { message: 'http', values: { url: 'http://shop.example/' } },
    ])
  })

  it('passes the same page over HTTPS', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(applies(rule, evidence)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('leaves out local development addresses and names', () => {
    for (const url of [
      'http://127.0.0.1:8080/',
      'http://localhost:3000/',
      'http://shop.localhost/',
      'http://shop.test/',
      'http://printer.local/',
      'http://intranet.internal/',
      'http://nas.home.arpa/',
      'http://10.0.0.5/',
      'http://172.20.1.1/',
      'http://192.168.1.10/',
      'http://169.254.1.1/',
      'http://[::1]:8080/',
      'http://[fd12::1]/',
    ]) {
      expect(applies(rule, evidenceOf(htmlPage('<p>نص</p>', { url }))), url).toBe(false)
    }
    for (const url of ['http://example.com/', 'http://8.8.8.8/', 'http://172.32.0.1/']) {
      expect(applies(rule, evidenceOf(htmlPage('<p>نص</p>', { url }))), url).toBe(true)
    }
  })
})

import { describe, expect, it } from 'vitest'
import { isFromProxy, PROXY_SECRET_HEADER } from '../src/proxy-secret'

describe('isFromProxy', () => {
  const secret = 'a-proxy-secret-of-more-than-thirty-two-characters'

  it('is the header the site server sets, in the lower case Node gives request headers', () => {
    expect(PROXY_SECRET_HEADER).toBe('x-arablyzer-proxy-secret')
  })

  it('accepts the secret, and nothing else', () => {
    expect(isFromProxy(secret, secret)).toBe(true)
    expect(isFromProxy(`${secret} `, secret)).toBe(false)
    expect(isFromProxy(secret.toUpperCase(), secret)).toBe(false)
    expect(isFromProxy(secret.slice(0, -1), secret)).toBe(false)
    expect(isFromProxy(`${secret}${secret}`, secret)).toBe(false)
    expect(isFromProxy('', secret)).toBe(false)
    expect(isFromProxy(undefined, secret)).toBe(false)
  })

  it('accepts nothing when there is no secret to hold it against', () => {
    expect(isFromProxy(undefined, undefined)).toBe(false)
    expect(isFromProxy('', '')).toBe(false)
    expect(isFromProxy('anything', undefined)).toBe(false)
    expect(isFromProxy('anything', '')).toBe(false)
  })
})

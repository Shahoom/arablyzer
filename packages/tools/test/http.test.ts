import { describe, expect, it } from 'vitest'
import { locationOf, parseHttpExample } from '../src/http'

describe('parseHttpExample', () => {
  it('reads responses apart at blank lines, each a status line and its headers', () => {
    const responses = parseHttpExample(
      [
        'HTTP/1.1 302 Found',
        'Location: https://www.example.com/',
        '',
        'HTTP/2 200',
        'content-type:text/html; charset=utf-8',
        'X-Frame-Options:  DENY  ',
        'X-Frame-Options: SAMEORIGIN',
      ].join('\r\n'),
    )
    expect(responses).toEqual([
      { status: 302, headers: [['location', 'https://www.example.com/']] },
      {
        status: 200,
        headers: [
          ['content-type', 'text/html; charset=utf-8'],
          ['x-frame-options', 'DENY'],
          ['x-frame-options', 'SAMEORIGIN'],
        ],
      },
    ])
    expect(locationOf(responses[0] ?? { status: 0, headers: [] })).toBe('https://www.example.com/')
  })

  it('takes a page with no header, and blank lines around', () => {
    expect(parseHttpExample('\n\nHTTP/1.1 404 Not Found\n\n')).toEqual([
      { status: 404, headers: [] },
    ])
  })

  it.each([
    ['', /needs a response/],
    ['Content-Type: text/html', /starts with a status line/],
    ['HTTP/1.1 OK', /starts with a status line/],
    ['HTTP/1.1 200 OK\nnot a header', /"not a header" is not a header/],
    ['HTTP/1.1 200 OK\nX Frame: DENY', /is not a header/],
    ['HTTP/1.1 301 Moved Permanently\nLocation: /', /the last response is the page/],
    ['HTTP/1.1 200 OK\n\nHTTP/1.1 200 OK', /is a redirect .* with one Location/],
    ['HTTP/1.1 301 Moved\n\nHTTP/1.1 200 OK', /with one Location/],
    ['HTTP/1.1 301 Moved\nLocation: /a\nLocation: /b\n\nHTTP/1.1 200 OK', /with one Location/],
    ['HTTP/1.1 301 Moved\nLocation:\n\nHTTP/1.1 200 OK', /with one Location/],
  ])('refuses %j', (code, error) => {
    expect(() => parseHttpExample(code)).toThrow(error)
  })
})

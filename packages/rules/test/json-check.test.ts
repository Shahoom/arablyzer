import { describe, expect, it } from 'vitest'
import { checkJson } from '../src/lib/json-check'

const parses = (text: string) => {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

describe('checkJson (RFC 8259)', () => {
  it.each([
    '{}',
    '[]',
    ' { "a" : [1, -2.5e+3, 0, true, false, null, "x\\n\\u00e9\\"" ] } ',
    '"مرحبا"',
    '0',
    '[{"@type":"LocalBusiness","name":"مقهى \\"الواحة\\""}]',
  ])('accepts %s, as JSON.parse does', (text) => {
    expect(parses(text)).toBe(true)
    expect(checkJson(text)).toBeNull()
  })

  it.each([
    ['{"a": 1,}', 'trailing-comma', 7],
    ['[1, 2, ]', 'trailing-comma', 5],
    ['{"name": "مطعم "الأصيل""}', 'unexpected-character', 16],
    ['{"a": 1} x', 'unexpected-character', 9],
    ["{'a': 1}", 'unexpected-character', 1],
    ['{"a": 01}', 'unexpected-character', 7],
    ['{"a": tru}', 'unexpected-character', 6],
    ['﻿{}', 'unexpected-character', 0],
    ['{"a": "line\nbreak"}', 'control-character', 11],
    ['{"a": "\\x41"}', 'invalid-escape', 7],
    ['{"a": "\\u12G4"}', 'invalid-escape', 7],
    ['{"a": [1, 2', 'unexpected-end', 11],
    ['{"a": "open', 'unexpected-end', 11],
    ['', 'unexpected-end', 0],
    ['{"a" 1}', 'unexpected-character', 5],
  ])('rejects %j as %s at offset %i, as JSON.parse does', (text, problem, offset) => {
    expect(parses(text)).toBe(false)
    expect(checkJson(text)).toMatchObject({ problem, offset })
  })

  it('names the unexpected character, or its code point when invisible', () => {
    expect(checkJson('{"a": 1} x')?.character).toBe('x')
    expect(checkJson('﻿{}')?.character).toBe('U+FEFF')
  })

  it('handles deep nesting without recursion', () => {
    expect(checkJson('['.repeat(200_000))).toMatchObject({ problem: 'unexpected-end' })
    const deep = `${'['.repeat(50_000)}${']'.repeat(50_000)}`
    expect(checkJson(deep)).toBeNull()
  })
})

describe('checkJson agrees with JSON.parse on mutated JSON-LD', () => {
  const SOURCE = JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: 'مقهى "الواحة"',
      telephone: '+968 2412 3456',
      geo: { '@type': 'GeoCoordinates', latitude: 23.588, longitude: 58.3829 },
      openingHours: ['Sa-Th 08:00-23:00', 'Fr 14:00-23:00'],
      priceRange: null,
      smokingAllowed: false,
    },
    null,
    1,
  )
  const PIECES = [
    '',
    ',',
    '"',
    '\\',
    '\n',
    '}',
    ']',
    '{',
    '[',
    ':',
    '0',
    '-',
    'e',
    '.',
    ' ',
    'ا',
    'true',
    'x',
  ]

  it('for 5000 deterministic mutations', () => {
    let seed = 20260924
    const random = (limit: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return seed % limit
    }
    for (let i = 0; i < 5000; i++) {
      const at = random(SOURCE.length + 1)
      const cut = random(3)
      const piece = PIECES[random(PIECES.length)] ?? ''
      const text = SOURCE.slice(0, at) + piece + SOURCE.slice(at + cut)
      expect(checkJson(text) === null, JSON.stringify(text)).toBe(parses(text))
    }
  })
})

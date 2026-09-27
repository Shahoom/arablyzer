import { describe, expect, it } from 'vitest'
import { MAX_JSON_DEPTH, jsonPointer, jsonValueOffsets } from '../src/lib/json-positions'

const offsetsOf = (text: string, pointers: string[]) =>
  Object.fromEntries(jsonValueOffsets(text, new Set(pointers)))

describe('jsonValueOffsets', () => {
  it('gives where the asked values start, by JSON Pointer', () => {
    const text = '{ "a": [1, {"b": "x"}], "c/d": {}, "e~f": [] }'
    expect(offsetsOf(text, ['', '/a', '/a/0', '/a/1', '/a/1/b', '/c~1d', '/e~0f', '/zz'])).toEqual({
      '': 0,
      '/a': 7,
      '/a/0': 8,
      '/a/1': 11,
      '/a/1/b': 17,
      '/c~1d': 31,
      '/e~0f': 42,
    })
  })

  it('reads strings with escapes and Arabic text, numbers, literals and nesting', () => {
    const text = '[\n  "مطعم \\"الأصيل\\" \\\\",\n  -1.5e3, true, null, [[{"k": false}]]\n]'
    const offsets = jsonValueOffsets(text, new Set(['/0', '/1', '/2', '/3', '/4/0/0/k']))
    expect(
      [...offsets].map(([pointer, offset]) => [pointer, text.slice(offset, offset + 5)]),
    ).toEqual([
      ['/0', '"مطعم'],
      ['/1', '-1.5e'],
      ['/2', 'true,'],
      ['/3', 'null,'],
      ['/4/0/0/k', 'false'],
    ])
  })

  it('gives the last of repeated keys, as JSON.parse does', () => {
    const text = '{"price": 1, "price": 2}'
    expect(text.slice(jsonValueOffsets(text, new Set(['/price'])).get('/price'))).toBe('2}')
    expect(JSON.parse(text)).toEqual({ price: 2 })
  })

  it('stops at invalid JSON without looping, keeping what it found', () => {
    for (const text of [
      '[,1]',
      '{"a": 1,}',
      '{"a" 1}',
      '[}',
      '{',
      '"',
      '',
      '{"a": [1, 2',
      '{"\\',
    ]) {
      expect(jsonValueOffsets(text, new Set(['/a', '/0']))).toBeInstanceOf(Map)
    }
    expect(offsetsOf('{"a": 1, "b" 2}', ['/a', '/b'])).toEqual({ '/a': 6 })
  })

  it(`stops deeper than ${MAX_JSON_DEPTH} levels, keeping what came before`, () => {
    const deep = `${'['.repeat(200_000)}${']'.repeat(200_000)}`
    expect(offsetsOf(`{"a": 1, "b": ${deep}, "c": 2}`, ['/a', '/c'])).toEqual({ '/a': 6 })
    const shallow = `${'['.repeat(MAX_JSON_DEPTH)}1${']'.repeat(MAX_JSON_DEPTH)}`
    expect(offsetsOf(shallow, ['/0'.repeat(MAX_JSON_DEPTH)])).toEqual({
      ['/0'.repeat(MAX_JSON_DEPTH)]: MAX_JSON_DEPTH,
    })
  })
})

describe('jsonPointer', () => {
  it('escapes ~ and / in keys', () => {
    expect(jsonPointer('', 'offers')).toBe('/offers')
    expect(jsonPointer('/@graph', 0)).toBe('/@graph/0')
    expect(jsonPointer('', 'a/b~c')).toBe('/a~1b~0c')
  })
})

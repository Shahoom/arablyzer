import type { Header } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { asciiLowercase, getDecodeSplit } from '../src/lib/headers'

describe('getDecodeSplit', () => {
  // The Fetch standard's own examples of "get, decode, and split", for a header named `A`.
  it.each<[readonly Header[], string[] | null]>([
    [[['a', 'nosniff,']], ['nosniff', '']],
    [
      [
        ['a', ''],
        ['b', 'sniff'],
      ],
      [''],
    ],
    [[['b', 'sniff']], null],
    [[['a', 'text/html;", x/x']], ['text/html;", x/x']],
    [
      [
        ['a', 'text/html;"'],
        ['a', 'x/x'],
      ],
      ['text/html;", x/x'],
    ],
    [[['a', 'x/x;test="hi",y/y']], ['x/x;test="hi"', 'y/y']],
    [
      [
        ['a', 'x/x;test="hi"'],
        ['c', '**bingo**'],
        ['a', 'y/y'],
      ],
      ['x/x;test="hi"', 'y/y'],
    ],
    [[['a', 'x / x,,,1']], ['x / x', '', '', '1']],
    [
      [
        ['a', 'x / x'],
        ['a', ','],
        ['a', '1'],
      ],
      ['x / x', '', '', '1'],
    ],
    [[['a', '"1,2", 3']], ['"1,2"', '3']],
    [
      [
        ['a', '"1,2"'],
        ['d', '4'],
        ['a', '3'],
      ],
      ['"1,2"', '3'],
    ],
  ])('%j gives %j', (headers, expected) => {
    expect(getDecodeSplit(headers, 'a')).toEqual(expected)
  })

  it('keeps a backslash-quoted quote inside the string', () => {
    expect(getDecodeSplit([['a', '"a\\",b", c']], 'a')).toEqual(['"a\\",b"', 'c'])
    expect(getDecodeSplit([['a', '\t x \t']], 'a')).toEqual(['x'])
  })
})

describe('asciiLowercase', () => {
  it('lowers A to Z alone', () => {
    expect(asciiLowercase('NoSniff')).toBe('nosniff')
    // U+0130 lowercases to i and a combining dot elsewhere; here it stays.
    expect(asciiLowercase('NOSNİFF')).toBe('nosnİff')
  })
})

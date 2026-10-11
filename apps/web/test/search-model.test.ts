import type { SuggestResponse } from '@arablyzer/api-contract/codes'
import { describe, expect, it } from 'vitest'
import { fetchKeywordsResult, fetchSearchStatus, postSearch } from '../src/islands/api'
import {
  arabicShare,
  BOM,
  csvCell,
  filterGroups,
  parseDomain,
  parseQueries,
  parseSeed,
  scriptParts,
  suggestRows,
  toCsv,
} from '../src/islands/search/model'

describe('what the forms accept', () => {
  it('takes a seed of two characters to four words, spaces folded', () => {
    expect(parseSeed('  قهوة   عربية ')).toBe('قهوة عربية')
    expect(parseSeed('a')).toBeNull()
    expect(parseSeed('one two three four five')).toBeNull()
    expect(parseSeed('x'.repeat(61))).toBeNull()
    expect(parseSeed('<b>')).toBeNull()
    expect(parseSeed('--')).toBeNull()
  })

  it('takes one to five queries, a line each, repeats and empty lines dropped', () => {
    expect(parseQueries('قهوة\n\n  قهوة  \r\nشاي مغربي\n')).toEqual(['قهوة', 'شاي مغربي'])
    expect(parseQueries('')).toBeNull()
    expect(parseQueries('a1\nb2\nc3\nd4\ne5\nf6')).toBeNull()
    expect(parseQueries('a1\na1\na1')).toEqual(['a1'])
    expect(parseQueries('x\nقهوة')).toBeNull()
    expect(parseQueries('one two three four five six seven eight nine')).toBeNull()
  })

  it('takes a domain as a host name, or nothing', () => {
    expect(parseDomain('')).toBe('')
    expect(parseDomain(' https://www.Example.com/ar/ ')).toBe('example.com')
    expect(parseDomain('shop.example.co.uk')).toBe('shop.example.co.uk')
    expect(parseDomain('متجر.السعودية')).toBe('متجر.السعودية')
    for (const bad of ['localhost', 'a b.com', 'user@example.com', 'example.com:8080', '.com']) {
      expect(parseDomain(bad), bad).toBeNull()
    }
  })
})

describe('the CSV', () => {
  it('quotes what needs it and defuses formulas', () => {
    expect(csvCell('قهوة')).toBe('قهوة')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    for (const start of ['+1', '-1', '@x', '\tx']) expect(csvCell(start).startsWith("'")).toBe(true)
  })

  it('starts with the byte order mark Excel needs for Arabic, and ends each line with CRLF', () => {
    const text = toCsv([
      ['a', 'b'],
      ['قهوة', 'x'],
    ])
    expect(text.startsWith(BOM)).toBe(true)
    expect(text.slice(1)).toBe('a,b\r\nقهوة,x\r\n')
  })

  it('flattens the tree to a group, a trigger and a suggestion', () => {
    const response: SuggestResponse = {
      seed: 'قهوة',
      groups: [
        { kind: 'seed', trigger: '', suggestions: ['قهوة', 'قهوة عربية'] },
        { kind: 'question', trigger: 'كيف', suggestions: ['كيف قهوة'] },
        { kind: 'letter', trigger: 'ب', suggestions: [] },
      ],
      total: 3,
      answered: 3,
      asked: 3,
      stopped: null,
    }
    expect(suggestRows(response, ['G', 'T', 'S'], (kind) => kind.toUpperCase())).toEqual([
      ['G', 'T', 'S'],
      ['SEED', '', 'قهوة'],
      ['SEED', '', 'قهوة عربية'],
      ['QUESTION', 'كيف', 'كيف قهوة'],
    ])
  })

  it('searches the list with the spellings folded and drops the empty groups', () => {
    const groups = [
      { kind: 'seed' as const, trigger: '', suggestions: ['أحذية رياضية', 'حذاء'] },
      { kind: 'letter' as const, trigger: 'ب', suggestions: ['Shoes Online'] },
    ]
    expect(filterGroups(groups, 'احذيه')).toEqual([
      { kind: 'seed', trigger: '', suggestions: ['أحذية رياضية'] },
    ])
    expect(filterGroups(groups, 'shoes')).toHaveLength(1)
    expect(filterGroups(groups, '')).toHaveLength(2)
    expect(filterGroups(groups, 'zzz')).toEqual([])
  })
})

describe('the scripts’ shares', () => {
  const share = (queries: number, clicks: number, impressions: number) => ({
    queries,
    clicks,
    impressions,
  })
  const scripts = {
    arabic: share(6, 85, 750),
    mixed: share(1, 0, 50),
    latin: share(2, 1, 200),
    other: share(1, 0, 0),
  }

  it('says the Arabic share of impressions, and none when nothing was shown', () => {
    expect(arabicShare(scripts)).toBeCloseTo(0.75)
    const none = {
      arabic: share(0, 0, 0),
      mixed: share(0, 0, 0),
      latin: share(0, 0, 0),
      other: share(0, 0, 0),
    }
    expect(arabicShare(none)).toBeNull()
  })

  it('lays the bar out in a fixed order, each segment starting where the last ended', () => {
    const parts = scriptParts(scripts)
    expect(parts.map((p) => p.script)).toEqual(['arabic', 'mixed', 'latin', 'other'])
    expect(parts[0]?.x).toBe(0)
    expect(parts[1]?.x).toBeCloseTo(75)
    expect(parts[2]?.x).toBeCloseTo(80)
    expect(parts.reduce((sum, p) => sum + p.share, 0)).toBeCloseTo(1)
  })
})

const answer = (status: number, body: unknown) =>
  (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as unknown as typeof fetch

describe('the API client', () => {
  it('reads the status, and null when the API does not say', async () => {
    expect(await fetchSearchStatus(answer(200, { suggest: true, serp: false }))).toEqual({
      suggest: true,
      serp: false,
    })
    expect(await fetchSearchStatus(answer(500, {}))).toBeNull()
    expect(await fetchSearchStatus(() => Promise.reject(new Error('x')))).toBeNull()
  })

  it('posts JSON to the same origin and gives the value, or a scan’s refusal with when to return', async () => {
    let sent: { url: string; init: RequestInit | undefined } | undefined
    const spy = ((url: string, init?: RequestInit) => {
      sent = { url, init }
      return Promise.resolve(new Response(JSON.stringify({ total: 3 }), { status: 200 }))
    }) as unknown as typeof fetch
    expect(await postSearch('/api/search/suggest', { seed: 'قهوة' }, spy)).toEqual({
      ok: true,
      value: { total: 3 },
    })
    expect(sent?.url).toBe('/api/search/suggest')
    expect(sent?.init?.method).toBe('POST')
    expect(sent?.init?.credentials).toBe('same-origin')
    expect(JSON.parse(sent?.init?.body as string)).toEqual({ seed: 'قهوة' })

    expect(
      await postSearch('/x', {}, answer(429, { error: 'rate-limited', retryAfterSeconds: 30 })),
    ).toEqual({ ok: false, error: { code: 'rate-limited', retryAfterSeconds: 30 } })
    expect(await postSearch('/x', {}, answer(502, { error: 'what' }))).toEqual({
      ok: false,
      error: { code: 'unavailable' },
    })
    expect(await postSearch('/x', {}, () => Promise.reject(new Error('x')))).toEqual({
      ok: false,
      error: { code: 'network' },
    })
  })

  it('reads the keywords result once, and only when it is one', async () => {
    const result = { period: { start: 'a', end: 'b' }, top: [], opportunities: [], scripts: {} }
    expect(await fetchKeywordsResult('x'.repeat(43), answer(200, result))).toMatchObject({
      ok: true,
    })
    expect(await fetchKeywordsResult('x'.repeat(43), answer(404, {}))).toEqual({
      ok: false,
      reason: 'missing',
    })
    // A report's Search Console result is not a keywords result.
    expect(
      await fetchKeywordsResult(
        'x'.repeat(43),
        answer(200, { period: {}, queries: [], pages: [] }),
      ),
    ).toMatchObject({ ok: false })
  })
})

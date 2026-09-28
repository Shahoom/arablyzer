import { SCAN_ERROR_CODES } from '@arablyzer/api-contract/codes'
import { DEFAULT_POLICY } from '@arablyzer/egress'
import { describe, expect, it } from 'vitest'
import { ALL_COPY, codeParts, HOME, SCAN_FORM, SITE, TOPICS } from '../src/index'

/** Every leaf of an object, with its path; functions are called with sample numbers. */
function leaves(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return [[path, value]]
  if (typeof value === 'function') {
    const sample = (value as (...args: number[]) => unknown)(3, 18, 390)
    return leaves(sample, `${path}()`)
  }
  if (Array.isArray(value)) return value.flatMap((item, index) => leaves(item, `${path}[${index}]`))
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, item]) => leaves(item, `${path}.${key}`))
  }
  return []
}

describe('interface copy', () => {
  it('has the same keys in both languages, none empty', () => {
    for (const [file, copy] of Object.entries(ALL_COPY)) {
      const ar = leaves(copy.ar)
      const en = leaves(copy.en)
      expect(
        ar.map(([path]) => path),
        file,
      ).toEqual(en.map(([path]) => path))
      for (const [path, text] of [...ar, ...en]) expect(text.trim(), `${file} ${path}`).not.toBe('')
    }
  })

  it('writes Arabic without directional marks, which the page sets with dir instead', () => {
    for (const copy of Object.values(ALL_COPY)) {
      for (const [path, text] of leaves(copy.ar)) {
        expect(/[‎‏؜‪-‮⁦-⁩]/u.test(text), path).toBe(false)
      }
    }
  })

  it('has words for every error the API can give', () => {
    for (const code of SCAN_ERROR_CODES) {
      expect(SCAN_FORM.ar.errors[code]).toBeTruthy()
      expect(SCAN_FORM.en.errors[code]).toBeTruthy()
    }
  })

  it('names the ports the egress policy allows', () => {
    expect(DEFAULT_POLICY.allowedPorts).toEqual([80, 443])
  })

  it('counts in Arabic as Arabic counts', () => {
    const tally = HOME.ar.figure.tally
    expect(tally(3, 18)).toBe('فشلت 3 قواعد · نجحت 18 قاعدة')
    expect(tally(1, 2)).toBe('فشلت قاعدة واحدة · نجحت قاعدتان')
    expect(tally(0, 11)).toBe('لم تفشل أي قاعدة · نجحت 11 قاعدة')
    expect(tally(103, 100)).toBe('فشلت 103 قواعد · نجحت 100 قاعدة')
    expect(HOME.en.figure.tally(1, 18)).toBe('1 rule failed · 18 passed')
    expect(HOME.en.figure.tally(0, 20)).toBe('No rule failed · 20 passed')
  })

  it('says when to scan again, in whole minutes rounded up', () => {
    expect(SCAN_FORM.ar.retryAfter(30)).toBe('جرّب بعد دقيقة.')
    expect(SCAN_FORM.ar.retryAfter(120)).toBe('جرّب بعد دقيقتين.')
    expect(SCAN_FORM.ar.retryAfter(301)).toBe('جرّب بعد 6 دقائق.')
    expect(SCAN_FORM.ar.retryAfter(3600)).toBe('جرّب بعد 60 دقيقة.')
    expect(SCAN_FORM.en.retryAfter(61)).toBe('Try again in 2 minutes.')
    expect(SCAN_FORM.en.retryAfter(1)).toBe('Try again in 1 minute.')
  })

  it('names every topic of the strip', () => {
    for (const topic of TOPICS) {
      expect(HOME.ar.topics.names[topic]).toBeTruthy()
      expect(HOME.en.topics.names[topic]).toBeTruthy()
    }
  })

  it('splits code out of text', () => {
    expect(codeParts('use `--json` for `all`.')).toEqual([
      { text: 'use ', code: false },
      { text: '--json', code: true },
      { text: ' for ', code: false },
      { text: 'all', code: true },
      { text: '.', code: false },
    ])
    expect(SITE.ar.tagline).toBe('محلّل المواقع العربية')
  })
})

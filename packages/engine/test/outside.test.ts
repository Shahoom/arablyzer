import { collectPage } from '@arablyzer/collectors'
import { RULES } from '@arablyzer/rules'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearCruxCountriesCache } from '../src/crux-countries'
import type { BigQueryClient } from '../src/bigquery'
import { outsideFacts, runOutside, type OutsideContext } from '../src/outside'
import type { Ask } from '../src/outside-http'

const page = collectPage({
  url: 'https://www.alwaha.com.sa/',
  status: 200,
  headers: [['content-type', 'text/html; charset=utf-8']],
  body: new TextEncoder().encode(
    '<!doctype html><html lang="ar"><head><meta charset="utf-8"></head><body><p>مرحبا</p></body></html>',
  ),
  certificate: null,
})
const rulesOf = (...ids: string[]) => RULES.filter((rule) => ids.includes(rule.id))
const noAsk: Ask = () => Promise.resolve(null)

const context = (
  ids: string[],
  options: OutsideContext['options'],
  privateAccess = false,
): OutsideContext => ({
  rules: rulesOf(...ids),
  page,
  hostname: 'www.alwaha.com.sa',
  reached: true,
  privateAccess,
  base: { userAgent: 'ArablyzerBot/1.0' },
  siteBase: { userAgent: 'ArablyzerBot/1.0' },
  allowed: () => Promise.resolve(true),
  options,
  dohUrl: undefined,
  signal: undefined,
})

beforeEach(() => {
  clearCruxCountriesCache()
})

describe('the services beside the site, in a scan', () => {
  it('runs the per-country query with the operator’s credentials and gives the facts', async () => {
    const client: BigQueryClient = {
      query: (sql, _parameters, options) =>
        Promise.resolve({
          rows: sql.includes('popularity')
            ? []
            : [{ country: 'SA', lcp: '0.9', inp: '0.9', cls: '0.9' }],
          bytesProcessed: 1000,
          bytesBilled: options.dryRun === true ? 0 : 1000,
          cacheHit: false,
        }),
    }
    const run = await runOutside(
      context(['crux-country-gaps'], {
        ask: noAsk,
        cruxCountries: { credentials: { clientEmail: 'a', privateKey: 'b' }, project: 'p', client },
      }),
    )
    expect(run.notices).toEqual([])
    const facts = outsideFacts(run.collected, rulesOf('crux-country-gaps'))
    expect(facts.cruxCountries?.origin).toBe('https://www.alwaha.com.sa')
    expect(
      facts.cruxCountries?.countries.find((country) => country.country === 'SA'),
    ).toMatchObject({
      found: true,
      good: { lcp: 0.9 },
    })
    // Not asked for by the scan's rules: no fact.
    expect(outsideFacts(run.collected, rulesOf('ar-html-lang')).cruxCountries).toBeUndefined()
  })

  it('says it is off, and sends nothing, when the operator gave nothing', async () => {
    const calls: string[] = []
    const ask: Ask = (request) => {
      calls.push(request.url)
      return Promise.resolve(null)
    }
    const run = await runOutside(
      context(['crux-country-gaps', 'ai-visibility-gap', 'misspellings-uncovered'], { ask }),
    )
    expect(run.notices.map((notice) => notice.code).sort()).toEqual([
      'ai-visibility-off',
      'crux-countries-off',
      'suggest-off',
    ])
    expect(run.collected).toEqual({})
    expect(calls).toEqual([])
  })

  it('asks nothing of a page on a private address', async () => {
    const calls: string[] = []
    const ask: Ask = (request) => {
      calls.push(request.url)
      return Promise.resolve(null)
    }
    const run = await runOutside(
      context(
        ['lookalike-domains', 'ai-visibility-gap'],
        { ask, aiVisibility: { keys: { openai: 'k' } } },
        true,
      ),
    )
    expect(calls).toEqual([])
    expect(run.collected).toEqual({})
  })
})

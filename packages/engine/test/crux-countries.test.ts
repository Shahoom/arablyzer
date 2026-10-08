import { generateKeyPairSync, createVerify } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearTokens,
  httpClient,
  parseCredentials,
  signAssertion,
  type BigQueryClient,
  type QueryOptions,
  type QueryParameter,
  type QueryResult,
} from '../src/bigquery'
import {
  clearCruxCountriesCache,
  DEFAULT_MAX_BYTES,
  metricsSql,
  monthsBefore,
  queryCruxCountries,
  rankSql,
} from '../src/crux-countries'
import { scan } from '../src/index'
import type { Ask, AskRequest } from '../src/outside-http'
import { createPolicy } from '@arablyzer/egress'
import { tempSite, type TempSite } from './helpers'

const NOW = new Date('2026-10-04T00:00:00Z')

interface Call {
  sql: string
  parameters: readonly QueryParameter[]
  options: QueryOptions
}

/** BigQuery in memory: the metrics query answers for SA and EG, the rank query for SA. */
function bigquery(options: { missingMonth?: string; bytes?: number; rankBroken?: boolean } = {}) {
  const calls: Call[] = []
  const client: BigQueryClient = {
    query(sql, parameters, queryOptions): Promise<QueryResult | null> {
      calls.push({ sql, parameters, options: queryOptions })
      if (options.missingMonth !== undefined && sql.includes(options.missingMonth)) {
        return Promise.resolve(null)
      }
      const bytes = options.bytes ?? 3 * 1024 ** 3
      if (queryOptions.dryRun === true) {
        if (options.rankBroken === true && sql.includes('popularity')) return Promise.resolve(null)
        return Promise.resolve({ rows: [], bytesProcessed: bytes, bytesBilled: 0, cacheHit: false })
      }
      if (sql.includes('popularity')) {
        return Promise.resolve({
          rows: [{ country: 'SA', rank: '5000' }],
          bytesProcessed: 1024 ** 3,
          bytesBilled: 1024 ** 3,
          cacheHit: false,
        })
      }
      return Promise.resolve({
        rows: [
          { country: 'SA', lcp: '0.91', inp: '0.97', cls: '0.99' },
          { country: 'EG', lcp: '0.4', inp: '0.8', cls: null },
          { country: 'EG', lcp: '0.6', inp: '0.8', cls: null },
        ],
        bytesProcessed: bytes,
        bytesBilled: bytes,
        cacheHit: false,
      })
    },
  }
  return { client, calls }
}

beforeEach(() => {
  clearCruxCountriesCache()
  clearTokens()
})

describe('the queries', () => {
  it('read the nine countries’ tables for the month, phones, with a named parameter', () => {
    const sql = metricsSql('202609')
    for (const code of ['sa', 'ae', 'eg', 'kw', 'qa', 'bh', 'om', 'jo', 'ma']) {
      expect(sql).toContain(`\`chrome-ux-report.country_${code}.202609\``)
    }
    expect(sql.match(/UNION ALL/g)).toHaveLength(8)
    expect(sql).toContain("form_factor.name = 'phone'")
    expect(sql).toContain('origin = @origin')
    expect(sql).toContain('<= 2500')
    expect(sql).toContain('<= 200')
    expect(sql).toContain('<= 0.1')
    expect(sql).not.toContain('https://')
    expect(rankSql('202609')).toContain('experimental.popularity.rank')
  })

  it('name the month before this one, and the month before that', () => {
    expect(monthsBefore(NOW)).toEqual(['202609', '202608'])
    expect(monthsBefore(new Date('2027-01-15T00:00:00Z'))).toEqual(['202612', '202611'])
  })
})

describe('the Chrome UX Report by country', () => {
  it('dry-runs, then runs under the cap, and reads the good shares and the rank', async () => {
    const { client, calls } = bigquery()
    const facts = await queryCruxCountries({
      origin: 'https://alwaha.com.sa',
      options: { client },
      now: () => NOW,
    })
    expect(facts.outcome).toBe('checked')
    if (facts.outcome !== 'checked') return
    expect(facts.month).toBe('202609')
    expect(facts.bytes).toBe(4 * 1024 ** 3)
    const byCode = Object.fromEntries(facts.countries.map((country) => [country.country, country]))
    expect(byCode.SA).toMatchObject({
      found: true,
      good: { lcp: 0.91, inp: 0.97, cls: 0.99 },
      rank: 5000,
    })
    // Two rows of one country are averaged.
    expect(byCode.EG).toMatchObject({
      found: true,
      good: { lcp: 0.5, inp: 0.8, cls: null },
      rank: null,
    })
    expect(byCode.MA).toMatchObject({ found: false })
    // Dry run first, then the run; every call carries the cap and the origin as a parameter.
    expect(
      calls.map((call) => [call.options.dryRun === true, call.sql.includes('popularity')]),
    ).toEqual([
      [true, false],
      [false, false],
      [true, true],
      [false, true],
    ])
    for (const call of calls) {
      expect(call.options.maximumBytesBilled).toBeLessThanOrEqual(DEFAULT_MAX_BYTES)
      expect(call.parameters).toEqual([{ name: 'origin', value: 'https://alwaha.com.sa' }])
    }
  })

  it('does not run a query a dry run says is over the cap, so nothing is billed', async () => {
    const { client, calls } = bigquery({ bytes: 50 * 1024 ** 3 })
    const facts = await queryCruxCountries({
      origin: 'https://alwaha.com.sa',
      options: { client, maxBytes: 20 * 1024 ** 3 },
      now: () => NOW,
    })
    expect(facts).toEqual({ outcome: 'too-big', bytes: 50 * 1024 ** 3, cap: 20 * 1024 ** 3 })
    expect(calls.every((call) => call.options.dryRun === true)).toBe(true)
  })

  it('falls back to the month before when the latest tables are not there', async () => {
    const { client } = bigquery({ missingMonth: '202609' })
    const facts = await queryCruxCountries({
      origin: 'https://a.com',
      options: { client },
      now: () => NOW,
    })
    expect(facts.outcome === 'checked' && facts.month).toBe('202608')
  })

  it('fails when neither month answers, and keeps the countries when only the rank fails', async () => {
    const none = bigquery({ missingMonth: '2026' })
    expect(
      await queryCruxCountries({
        origin: 'https://b.com',
        options: { client: none.client },
        now: () => NOW,
      }),
    ).toEqual({
      outcome: 'failed',
    })
    const norank = bigquery({ rankBroken: true })
    const facts = await queryCruxCountries({
      origin: 'https://c.com',
      options: { client: norank.client },
      now: () => NOW,
    })
    expect(
      facts.outcome === 'checked' && facts.countries.every((country) => country.rank === null),
    ).toBe(true)
  })

  it('keeps a day of answers: the second scan of an origin asks BigQuery nothing', async () => {
    const first = bigquery()
    await queryCruxCountries({
      origin: 'https://d.com',
      options: { client: first.client },
      now: () => NOW,
    })
    const second = bigquery()
    await queryCruxCountries({
      origin: 'https://d.com',
      options: { client: second.client },
      now: () => NOW,
    })
    expect(second.calls).toHaveLength(0)
  })
})

describe('the BigQuery client', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const key = JSON.stringify({ client_email: 'svc@proj.iam.gserviceaccount.com', private_key: pem })

  it('reads a service account key as JSON or base64, and refuses anything else', () => {
    expect(parseCredentials(key)).toMatchObject({ clientEmail: 'svc@proj.iam.gserviceaccount.com' })
    expect(parseCredentials(Buffer.from(key).toString('base64'))?.privateKey).toBe(pem)
    expect(parseCredentials('{"client_email":"x"}')).toBeNull()
    expect(parseCredentials('not json')).toBeNull()
  })

  it('signs a JWT for the BigQuery scope that Google’s key would verify', () => {
    const credentials = parseCredentials(key)
    if (credentials === null) throw new Error('credentials')
    const [header, claims, signature] = signAssertion(credentials, 1_800_000_000).split('.')
    expect(JSON.parse(Buffer.from(header ?? '', 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    })
    expect(JSON.parse(Buffer.from(claims ?? '', 'base64url').toString())).toEqual({
      iss: 'svc@proj.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/bigquery',
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_800_000_000,
      exp: 1_800_003_600,
    })
    const verify = createVerify('RSA-SHA256')
    verify.update(`${header ?? ''}.${claims ?? ''}`)
    expect(verify.verify(publicKey, signature ?? '', 'base64url')).toBe(true)
  })

  it('gets a token once, then posts the query with the cap and the named parameter', async () => {
    const requests: AskRequest[] = []
    const ask: Ask = (request) => {
      requests.push(request)
      const body = request.url.includes('oauth2')
        ? { access_token: 'tok', expires_in: 3600 }
        : {
            jobComplete: true,
            schema: { fields: [{ name: 'country' }, { name: 'lcp' }] },
            rows: [{ f: [{ v: 'SA' }, { v: '0.9' }] }],
            totalBytesProcessed: '100',
            totalBytesBilled: '10485760',
            cacheHit: false,
          }
      return Promise.resolve({ status: 200, body: new TextEncoder().encode(JSON.stringify(body)) })
    }
    const credentials = parseCredentials(key)
    if (credentials === null) throw new Error('credentials')
    const client = httpClient({
      ask,
      credentials,
      project: 'my-proj',
      now: () => 1_800_000_000_000,
    })
    const result = await client.query('SELECT 1', [{ name: 'origin', value: 'https://a.com' }], {
      maximumBytesBilled: 1000,
    })
    await client.query('SELECT 1', [], { maximumBytesBilled: 1000, dryRun: true })
    expect(result).toEqual({
      rows: [{ country: 'SA', lcp: '0.9' }],
      bytesProcessed: 100,
      bytesBilled: 10_485_760,
      cacheHit: false,
    })
    // One token request for two queries.
    expect(requests.filter((request) => request.url.includes('oauth2'))).toHaveLength(1)
    const token = requests[0]
    expect(token?.form?.grant_type).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer')
    const query = requests[1]
    expect(query?.url).toBe('https://bigquery.googleapis.com/bigquery/v2/projects/my-proj/queries')
    expect(query?.headers).toEqual({ authorization: 'Bearer tok' })
    expect(query?.json).toMatchObject({
      useLegacySql: false,
      maximumBytesBilled: '1000',
      parameterMode: 'NAMED',
      queryParameters: [{ name: 'origin', parameterValue: { value: 'https://a.com' } }],
    })
    expect((requests[2]?.json as { dryRun: boolean }).dryRun).toBe(true)
    // The key is never in a URL.
    expect(requests.every((request) => !request.url.includes('PRIVATE'))).toBe(true)
  })

  it('returns nothing when the token or the query is refused', async () => {
    const credentials = parseCredentials(key)
    if (credentials === null) throw new Error('credentials')
    const refuse: Ask = () => Promise.resolve({ status: 401, body: new Uint8Array() })
    const client = httpClient({ ask: refuse, credentials, project: 'p' })
    expect(await client.query('SELECT 1', [], { maximumBytesBilled: 1 })).toBeNull()
  })
})

describe('the tool in a scan', () => {
  let site: TempSite | undefined
  afterEach(async () => {
    await site?.close()
    site = undefined
  })

  it('is off without credentials: a notice, and nothing asked', async () => {
    site = await tempSite({
      'index.html':
        '<!doctype html><html lang="ar"><head><meta charset="utf-8"></head><body><p>مرحبا</p></body></html>',
    })
    const report = await scan(site.url('/'), {
      ruleIds: ['crux-country-gaps'],
      policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
      outside: {},
    })
    expect(report.scan.notices.map((notice) => notice.code)).toContain('crux-countries-off')
    expect(report.rules.find((rule) => rule.id === 'crux-country-gaps')?.status).toBe(
      'not-applicable',
    )
    expect(report.facts.cruxCountries).toBeUndefined()
  })
})

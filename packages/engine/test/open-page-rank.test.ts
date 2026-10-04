// A stand-in for the API on loopback: this test opens a socket of its own.
// eslint-disable-next-line no-restricted-imports
import http from 'node:http'
import { createPolicy } from '@arablyzer/egress'
import { afterEach, describe, expect, it } from 'vitest'
import { scan } from '../src/index'
import { resolverFor, tempSite, type TempSite } from './helpers'

const KEY = 'opr-test-key-88cc'
const PAGE = '<!doctype html><html lang="ar" dir="rtl"><body><h1>متجر</h1></body></html>'

let site: TempSite | undefined
let server: http.Server | undefined
const asked: {
  domains: string[]
  history: boolean
  method: string
  auth: string | undefined
}[] = []

afterEach(async () => {
  await site?.close()
  const open = server
  await new Promise((resolve) => {
    if (open === undefined) resolve(null)
    else open.close(resolve)
  })
  site = undefined
  server = undefined
  asked.length = 0
})

/** A stand-in for getPageRank, answering `status` with `row`. */
async function standIn(status: number, row: Record<string, unknown>) {
  const stand = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        domains: string[]
        include_history: boolean
      }
      asked.push({
        domains: body.domains,
        history: body.include_history,
        method: req.method ?? '',
        auth: req.headers.authorization,
      })
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ as_of: '2026-09-01', count: 1, results: [row] }))
    })
  })
  server = stand
  await new Promise<void>((resolve) => stand.listen(0, '127.0.0.1', resolve))
  const address = stand.address()
  if (address === null || typeof address === 'string') throw new Error('no port')
  return { port: address.port, endpoint: `http://127.0.0.1:${address.port}/v1/domains/bulk` }
}

/** A whole scan of a page under a public-looking name, which the resolver maps to the site. */
async function scanOf(status: number, row: Record<string, unknown>, key: string | null = KEY) {
  site = await tempSite({
    'index.html': PAGE,
    'site.json': JSON.stringify({ host: 'shop.example' }),
  })
  const stand = await standIn(status, row)
  return scan(site.url('/'), {
    policy: createPolicy({
      allowTargets: [site.port, stand.port].map((port) => ({ address: '127.0.0.1', port })),
    }),
    resolver: resolverFor(site),
    openPageRank: { apiKey: key ?? undefined, endpoint: stand.endpoint },
  })
}
const codes = (report: Awaited<ReturnType<typeof scan>>) =>
  report.scan.notices.map((notice) => notice.code)
const ROW = {
  domain: 'shop.example',
  found: true,
  open_page_rank: 5.21,
  rank: 98765,
  referring_domains: 321,
  history: [
    { date: '2025-06-01', open_page_rank: 4.5, estimated: false },
    { date: '2026-06-01', open_page_rank: 5.21, estimated: false },
  ],
}

describe('Open PageRank in a scan', () => {
  it('asks for the page’s domain and its history with the key as a bearer token, and puts the rank on the report', async () => {
    const report = await scanOf(200, ROW)
    expect(asked).toEqual([
      { domains: ['shop.example'], history: true, method: 'POST', auth: `Bearer ${KEY}` },
    ])
    expect(report.facts.openPageRank).toEqual({
      domain: 'shop.example',
      score: 5.21,
      position: 98765,
      referringDomains: 321,
      trend: 'rising',
      asOf: '2026-09-01',
    })
    expect(JSON.stringify(report)).not.toContain(KEY)
    expect(codes(report)).not.toContain('open-page-rank-no-key')
  })

  it('says it is off without a key, and asks nothing', async () => {
    const report = await scanOf(200, ROW, null)
    expect(asked).toEqual([])
    expect(codes(report)).toContain('open-page-rank-no-key')
    expect(report.facts.openPageRank).toBeUndefined()
  })

  it('asks nothing for a tool’s scan, which names its rules, and says nothing of it', async () => {
    site = await tempSite({
      'index.html': PAGE,
      'site.json': JSON.stringify({ host: 'shop.example' }),
    })
    const stand = await standIn(200, ROW)
    const report = await scan(site.url('/'), {
      ruleIds: ['ar-html-lang'],
      policy: createPolicy({
        allowTargets: [site.port, stand.port].map((port) => ({ address: '127.0.0.1', port })),
      }),
      resolver: resolverFor(site),
      openPageRank: { apiKey: KEY, endpoint: stand.endpoint },
    })
    expect(asked).toEqual([])
    expect(codes(report).filter((code) => code.startsWith('open-page-rank'))).toEqual([])
  })

  it.each([
    [403, 'open-page-rank-refused'],
    [500, 'open-page-rank-failed'],
  ])('shows no rank, and says why, when the API answers %i', async (status, code) => {
    const report = await scanOf(status, ROW)
    expect(codes(report)).toContain(code)
    expect(report.facts.openPageRank).toBeUndefined()
  })

  it('says the domain is not in the index yet when it does not list it', async () => {
    const report = await scanOf(200, { ...ROW, found: false, open_page_rank: null })
    expect(report.facts.openPageRank).toEqual({
      domain: 'shop.example',
      score: null,
      position: null,
      referringDomains: null,
      trend: null,
      asOf: null,
    })
    expect(codes(report).filter((code) => code.startsWith('open-page-rank'))).toEqual([])
  })

  it('never sends a private page to it', async () => {
    site = await tempSite({ 'index.html': PAGE })
    const stand = await standIn(200, ROW)
    const report = await scan(site.url('/'), {
      policy: createPolicy({ allowPrivate: true }),
      openPageRank: { apiKey: KEY, endpoint: stand.endpoint },
    })
    expect(asked).toEqual([])
    expect(codes(report)).toContain('open-page-rank-private')
  })
})

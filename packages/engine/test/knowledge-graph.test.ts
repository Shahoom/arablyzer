import { createPolicy } from '@arablyzer/egress'
import {
  serveKnowledgeGraph,
  type KnowledgeGraphData,
  type KnowledgeGraphStandIn,
} from '@arablyzer/fixtures'
import { afterEach, describe, expect, it } from 'vitest'
import { scan } from '../src/index'
import { tempSite, type TempSite } from './helpers'

const KEY = 'kg-test-key-31ff'
const RULE = ['knowledge-graph-entity']
const page = (head: string) =>
  `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">${head}</head><body><h1>متجر</h1></body></html>`
const TITLED = page('<title>متجر الواحة | قهوة</title>')

let site: TempSite | undefined
let standIn: KnowledgeGraphStandIn | undefined
afterEach(async () => {
  await site?.close()
  await standIn?.close()
  site = undefined
  standIn = undefined
})

async function scanWith(data: KnowledgeGraphData, html = TITLED, key: string | null = KEY) {
  site = await tempSite({ 'index.html': html })
  standIn = await serveKnowledgeGraph(data)
  return scan(site.url('/'), {
    ruleIds: RULE,
    policy: createPolicy({
      allowTargets: [site.port, standIn.port].map((port) => ({ address: '127.0.0.1', port })),
    }),
    ...(key === null ? {} : { knowledgeGraph: { apiKey: KEY, endpoint: standIn.endpoint } }),
  })
}
const codes = (report: Awaited<ReturnType<typeof scan>>) =>
  report.scan.notices.map((notice) => notice.code)

describe('Knowledge Graph in a scan', () => {
  it('asks for the brand in both languages, with the key in a header, and reports the entity', async () => {
    const report = await scanWith({
      en: [{ name: 'متجر الواحة', types: ['Organization'], description: 'Shop' }],
    })
    expect(standIn?.queries).toEqual([
      { query: 'متجر الواحة', languages: 'ar', key: KEY },
      { query: 'متجر الواحة', languages: 'en', key: KEY },
    ])
    expect(report.rules.map((rule) => rule.status)).toEqual(['fail'])
    expect(report.findings.map((finding) => finding.severity)).toEqual(['info'])
    expect(report.facts.knowledgeGraph).toMatchObject({
      outcome: 'known',
      brand: 'متجر الواحة',
      entities: [{ lang: 'en', description: 'Shop' }],
    })
    expect(JSON.stringify(report)).not.toContain(KEY)
  })

  it('says unknown in the facts, with no finding, for a brand Google does not know', async () => {
    const report = await scanWith({ ar: [{ name: 'غير ذلك' }] })
    expect(report.rules.map((rule) => rule.status)).toEqual(['pass'])
    expect(report.facts.knowledgeGraph).toEqual({
      outcome: 'unknown',
      brand: 'متجر الواحة',
      entities: [],
    })
  })

  it('takes the name from Organization JSON-LD first', async () => {
    const html = page(
      '<title>صفحة</title><script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script>',
    )
    await scanWith({}, html)
    expect(standIn?.queries.map((query) => query.query)).toEqual(['Acme', 'Acme'])
  })

  it('does not apply without a key, and asks nothing', async () => {
    const report = await scanWith({}, TITLED, null)
    expect(report.rules.map((rule) => rule.status)).toEqual(['not-applicable'])
    expect(codes(report)).toContain('knowledge-graph-no-key')
    expect(standIn?.queries).toEqual([])
  })

  it('is an error and a notice, never a verdict, when Google refuses', async () => {
    const report = await scanWith({ error: 403 })
    expect(report.rules.map((rule) => [rule.status, rule.error])).toEqual([
      ['error', 'knowledge-graph-unchecked'],
    ])
    expect(codes(report)).toContain('knowledge-graph-refused')
    expect(report.facts.knowledgeGraph).toBeUndefined()
  })

  it('never sends a private page’s name to Google', async () => {
    site = await tempSite({ 'index.html': TITLED })
    standIn = await serveKnowledgeGraph({})
    const report = await scan(site.url('/'), {
      ruleIds: RULE,
      policy: createPolicy({ allowPrivate: true }),
      knowledgeGraph: { apiKey: KEY, endpoint: standIn.endpoint },
    })
    expect(standIn.queries).toEqual([])
    expect(codes(report)).toContain('knowledge-graph-private')
  })
})

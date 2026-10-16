import { createPolicy } from '@arablyzer/egress'
import { serveNlpWith, type NlpAnswer, type NlpStandIn } from '@arablyzer/fixtures'
import { afterEach, describe, expect, it } from 'vitest'
import { forgetNlpFailures, NLP_REST_MS, scan } from '../src/index'
import { tempSite, type TempSite } from './helpers'

let site: TempSite | undefined
let stand: NlpStandIn | undefined
afterEach(async () => {
  await site?.close()
  await stand?.close()
  site = undefined
  stand = undefined
  forgetNlpFailures()
})

const PAGE = `<!doctype html><html lang="ar"><head><meta charset="utf-8"><title>متجر الواحة</title></head><body>
<h1>متجر الواحة للهدايا</h1>
<p>تتميز الاسعار في متجرنا بالمنافسة طوال العام، ونوصل طلباتك إلى جميع مدن المملكة خلال أيام قليلة.</p>
<p>وايد حلو هالمنتج والتوصيل كان سريع الحين وصلني بعد يومين بس والسعر زين مقارنة بالمحلات الثانية.</p>
<p><code>الاسعار</code></p>
</body></html>`

const LONG = `<!doctype html><html lang="ar"><head><meta charset="utf-8"></head><body>${'<p>نقدم لكم أفضل المنتجات والخدمات وهي مصنوعة بعناية من أجود المواد المتوفرة في السوق.</p>'.repeat(9)}</body></html>`

const SPELL = {
  min_confidence: 0.9,
  words: 30,
  judged: 28,
  truncated: false,
  findings: [
    {
      text: 1,
      start: 5,
      end: 12,
      word: 'الاسعار',
      suggestion: 'الأسعار',
      family: 'hamza',
      confidence: 0.97,
      before: 'تتميز',
      after: 'في متجرنا',
      alternatives: [],
    },
    {
      text: 0,
      start: 0,
      end: 3,
      word: 'ابد',
      suggestion: 'ابدأ',
      family: 'bogus',
      confidence: 0.99,
      before: '',
      after: '',
      alternatives: [],
    },
  ],
}
const DIALECT = {
  model: 'camel-dialectid-model6',
  label: 'gulf',
  probabilities: { msa: 0.1, gulf: 0.8, egyptian: 0.04, levantine: 0.03, maghrebi: 0.03 },
  votes: { msa: 0, gulf: 3, egyptian: 0, levantine: 0, maghrebi: 0 },
  chunks: 3,
  words: 90,
  truncated: false,
}

async function stub(
  answers: Record<string, { status?: number; body?: unknown; hang?: boolean }>,
): Promise<{
  url: string
  seen: { paths: string[]; bodies: { texts: string[]; min_confidence?: number }[] }
}> {
  const seen: { paths: string[]; bodies: { texts: string[]; min_confidence?: number }[] } = {
    paths: [],
    bodies: [],
  }
  stand = await serveNlpWith((path, body): NlpAnswer => {
    seen.paths.push(path)
    seen.bodies.push(body as unknown as { texts: string[]; min_confidence?: number })
    const answer = answers[path]
    if (answer?.hang === true) return { hang: true }
    return { status: answer?.status ?? 404, body: answer?.body ?? {} }
  })
  return { url: stand.url, seen }
}

async function scanOf(
  nlp: { url: string; timeoutMs?: number; minConfidence?: number } | undefined,
  ruleIds = ['ar-spelling', 'dialect-register'],
) {
  site = await tempSite({ 'index.html': PAGE })
  return scan(site.url('/'), {
    ruleIds,
    policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
    ...(nlp === undefined ? {} : { nlp }),
  })
}

describe('the Arabic NLP service in a scan', () => {
  it('sends the visible Arabic text, judges the slips it names and keeps what it does not know out', async () => {
    const { url, seen } = await stub({
      '/spell': { status: 200, body: SPELL },
      '/dialect': { status: 200, body: DIALECT },
    })
    const report = await scanOf({ url })
    expect(seen.paths).toEqual(['/spell', '/dialect'])
    // text nodes, trimmed, none of the code, each once
    expect(seen.bodies[0]?.texts).toHaveLength(3)
    expect(seen.bodies[0]?.texts.join('|')).not.toContain('<')
    expect(seen.bodies[0]?.min_confidence).toBe(0.9)
    const spelling = report.findings.filter((finding) => finding.ruleId === 'ar-spelling')
    expect(spelling).toHaveLength(1)
    expect(spelling[0]).toMatchObject({
      severity: 'moderate',
      evidence: { values: { word: 'الاسعار', suggestion: 'الأسعار' } },
    })
    expect(report.rules.find((result) => result.id === 'ar-spelling')?.status).toBe('fail')
    expect(report.scan.status).toBe('complete')
    expect(report.scan.notices.map((notice) => notice.code)).not.toContain('nlp-unavailable')
  })

  it('puts the model into the dialect fact, and reads it where the word list found nothing', async () => {
    const { url } = await stub({
      '/spell': { status: 200, body: SPELL },
      '/dialect': { status: 200, body: DIALECT },
    })
    site = await tempSite({ 'index.html': LONG })
    const report = await scan(site.url('/'), {
      ruleIds: ['dialect-register'],
      policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
      nlp: { url },
    })
    // Modern Standard to the word list, Gulf to the model: the model's verdict is the page's
    expect(report.facts.dialect).toMatchObject({
      outcome: 'classified',
      label: 'gulf',
      source: 'model',
      model: { label: 'gulf', chunks: 3, probabilities: { gulf: 80 } },
    })
  })

  it('says so, skips the rule and goes on when the service answers an error', async () => {
    const { url } = await stub({ '/spell': { status: 503, body: { error: 'busy' } } })
    const report = await scanOf({ url })
    expect(report.rules.find((result) => result.id === 'ar-spelling')?.status).toBe(
      'not-applicable',
    )
    expect(report.scan.notices.map((notice) => notice.code)).toContain('nlp-unavailable')
    expect(report.scan.status).toBe('complete')
    // the dialect rule reads its word list
    expect(report.rules.find((result) => result.id === 'dialect-register')?.status).toBeDefined()
    expect(report.facts.dialect?.source).toBeUndefined()
  })

  it('gives up on a service that does not answer in time, and does not ask again for a while', async () => {
    const { url, seen } = await stub({ '/spell': { hang: true } })
    const started = Date.now()
    const report = await scanOf({ url, timeoutMs: 300 })
    expect(Date.now() - started).toBeLessThan(5_000)
    expect(report.scan.notices.map((notice) => notice.code)).toContain('nlp-unavailable')
    const before = seen.paths.length
    await site?.close()
    const again = await scanOf({ url, timeoutMs: 300 })
    expect(seen.paths.length).toBe(before)
    expect(again.scan.notices.map((notice) => notice.code)).toContain('nlp-unavailable')
    expect(again.scan.status).toBe('complete')
    expect(NLP_REST_MS).toBeGreaterThan(0)
  })

  it('does not fail on a service that is not there at all', async () => {
    const report = await scanOf({ url: 'http://127.0.0.1:9' })
    expect(report.scan.notices.map((notice) => notice.code)).toContain('nlp-unavailable')
    expect(report.scan.status).toBe('complete')
  })

  it('does not ask without a service configured, nor for rules that do not read it', async () => {
    const { url, seen } = await stub({
      '/spell': { status: 200, body: SPELL },
      '/dialect': { status: 200, body: DIALECT },
    })
    const without = await scanOf(undefined)
    expect(without.rules.find((result) => result.id === 'ar-spelling')?.status).toBe(
      'not-applicable',
    )
    expect(without.scan.notices.map((notice) => notice.code)).not.toContain('nlp-unavailable')
    await site?.close()
    await scanOf({ url }, ['ar-html-lang'])
    expect(seen.paths).toEqual([])
  })

  it('refuses a malformed answer instead of trusting it', async () => {
    const { url } = await stub({ '/spell': { status: 200, body: { findings: 'nope' } } })
    const report = await scanOf({ url }, ['ar-spelling'])
    expect(report.scan.notices.map((notice) => notice.code)).toContain('nlp-unavailable')
  })
})

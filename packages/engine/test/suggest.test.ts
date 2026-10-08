import { createPolicy } from '@arablyzer/egress'
import { collectPage } from '@arablyzer/collectors'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scan } from '../src/index'
import type { Ask, AskRequest } from '../src/outside-http'
import { askSuggest, clearSuggestCache, MAX_CALLS, typedIn } from '../src/suggest'
import { tempSite, type TempSite } from './helpers'

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
const html = (title: string, body: string) =>
  `<!doctype html><html lang="ar"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`
const pageOf = (source: string) =>
  collectPage({
    url: 'https://alwaha.com.sa/',
    status: 200,
    headers: [['content-type', 'text/html; charset=utf-8']],
    body: new TextEncoder().encode(source),
    certificate: null,
  })

/** Google's endpoint, in memory: it completes only the queries in `typed`. */
function google(typed: Record<string, string[]>, options: { dead?: boolean } = {}) {
  const calls: AskRequest[] = []
  const ask: Ask = (request) => {
    calls.push(request)
    if (options.dead === true) return Promise.resolve({ status: 429, body: new Uint8Array() })
    const q = new URL(request.url).searchParams.get('q') ?? ''
    return Promise.resolve({ status: 200, body: encode([q, typed[q] ?? [], [], {}]) })
  }
  return { ask, calls }
}

beforeEach(() => {
  clearSuggestCache()
})

describe('Google’s suggestions for the misspellings', () => {
  it('counts a form as typed when a suggestion begins with it', () => {
    expect(typedIn('قهوه', ['قهوة', 'قهوه سريعه ذوبان'])).toBe('قهوه سريعه ذوبان')
    expect(typedIn('قهوه', ['قهوة', 'قهوة باردة'])).toBeNull()
    expect(typedIn('قهوه', ['قهوهخانه'])).toBeNull()
  })

  it('asks no more than twelve times, one after another, and reads what the page writes', async () => {
    const { ask, calls } = google({
      قهوه: ['قهوه سريعه'],
      qahwa: ['qahwa coffee'],
      مختصه: ['مختصه'],
    })
    const page = pageOf(
      html('قهوة مختصة محمصة', '<h1>قهوة مختصة محمصة</h1><p>نحمص قهوه طازجة.</p>'),
    )
    const facts = await askSuggest(page, { ask, options: {}, gapMs: 0 })
    expect(facts.outcome).toBe('checked')
    if (facts.outcome !== 'checked') return
    expect(calls.length).toBeLessThanOrEqual(MAX_CALLS)
    expect(facts.calls).toBe(calls.length)
    expect(new Set(calls.map((call) => new URL(call.url).hostname))).toEqual(
      new Set(['suggestqueries.google.com']),
    )
    expect(new URL(calls[0]?.url ?? '').searchParams.get('client')).toBe('firefox')
    expect(new URL(calls[0]?.url ?? '').searchParams.get('hl')).toBe('ar')
    const coffee = facts.terms.find((term) => term.term === 'قهوة')
    expect(coffee?.written).toBe(true)
    const ha = coffee?.variants.find((variant) => variant.text === 'قهوه')
    expect(ha).toMatchObject({
      kind: 'ta-marbuta',
      typed: true,
      suggestion: 'قهوه سريعه',
      covered: true,
    })
    expect(
      coffee?.variants.find((variant) => variant.text === 'qahwa'.replace('qahwa', 'qhwh')),
    ).toBeUndefined()
  })

  it('stops at the first answer it cannot read, and fails when it never got one', async () => {
    const dead = google({}, { dead: true })
    const page = pageOf(html('قهوة', '<h1>قهوة مختصة</h1>'))
    expect(await askSuggest(page, { ask: dead.ask, options: {}, gapMs: 0 })).toEqual({
      outcome: 'failed',
    })
    expect(dead.calls).toHaveLength(1)
  })

  it('has nothing to ask about a page with no Arabic key word', async () => {
    const { ask, calls } = google({})
    expect(
      await askSuggest(pageOf(html('Home', '<h1>Welcome</h1>')), { ask, options: {} }),
    ).toEqual({
      outcome: 'no-terms',
    })
    expect(calls).toHaveLength(0)
  })
})

describe('the misspellings tool in a scan', () => {
  let site: TempSite | undefined
  afterEach(async () => {
    await site?.close()
    site = undefined
  })

  it('is off without the switch, with a notice and no request, and runs with it', async () => {
    site = await tempSite({ 'index.html': html('قهوة مختصة', '<h1>قهوة مختصة محمصة</h1>') })
    const policy = createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] })
    const { ask, calls } = google({ قهوه: ['قهوه سريعه'] })
    const off = await scan(site.url('/'), {
      ruleIds: ['misspellings-uncovered'],
      policy,
      outside: { ask },
    })
    expect(off.scan.notices.map((notice) => notice.code)).toContain('suggest-off')
    expect(off.rules.find((rule) => rule.id === 'misspellings-uncovered')?.status).toBe(
      'not-applicable',
    )
    expect(off.facts.suggest).toBeUndefined()
    expect(calls).toHaveLength(0)
    const on = await scan(site.url('/'), {
      ruleIds: ['misspellings-uncovered'],
      policy,
      outside: { ask, suggest: {}, test: { suggestGapMs: 0 } },
    })
    expect(on.facts.suggest?.calls).toBeGreaterThan(0)
    expect(on.findings.map((finding) => finding.ruleId)).toEqual(['misspellings-uncovered'])
    expect(on.rules.find((rule) => rule.id === 'misspellings-uncovered')?.status).toBe('fail')
  })
})

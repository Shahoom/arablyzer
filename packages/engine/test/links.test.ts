import { collectPage } from '@arablyzer/collectors'
import type { Rule } from '@arablyzer/rules'
import { afterEach, describe, expect, it } from 'vitest'
import { MAX_LINKS } from '../src/links'
import { evaluatePage, scan } from '../src/index'
import { policyFor, schemaErrors, tempSite, testRule, type TempSite } from './helpers'

// M2.3c: the page's links to its own site, each asked for once, HEAD then GET where HEAD answers
// an error, for the rules that read them, and for no other scan.

/** A rule that reads the links' checks, and finds each link that answered 4xx or 5xx. */
const linkRule: Rule<'found'> = testRule({
  id: 'link-rule',
  needs: ['html', 'links'],
  appliesTo: (_page, evidence) => (evidence?.links?.total ?? 0) > 0,
  detect: ({ links }) =>
    (links?.checks ?? []).flatMap((check) =>
      check.outcome === 'answered' && check.status >= 400
        ? [
            {
              message: 'found' as const,
              values: { what: `${check.method} ${String(check.status)} ${check.url}` },
              key: check.url,
            },
          ]
        : [],
    ),
})

const page = (links: string) =>
  `<!doctype html><html lang="ar" dir="rtl"><title>متجر</title><body>${links}</body></html>`

describe('scan: the page’s links to its own site', () => {
  let site: TempSite | undefined

  afterEach(async () => {
    await site?.close()
    site = undefined
  })

  const run = async (local: TempSite, rules: readonly Rule[] = [linkRule]) =>
    scan(local.url('/'), { rules, policy: policyFor(local) })

  it('asks for each once, HEAD then GET where HEAD answers an error, and follows no redirect', async () => {
    site = await tempSite(
      {
        'index.html': page(`
          <a href="/ar/offers/">العروض</a>
          <a href="/ar/offers/#top">العروض</a>
          <a href="/ar/missing/">مفقودة</a>
          <a href="/ar/old/">قديمة</a>
          <a href="/ar/down/">معطلة</a>
          <a href="/ar/no-head/">بلا HEAD</a>
          <a href="/">الرئيسية</a>`),
        'ar/offers/index.html': page('<p>العروض</p>'),
        'ar/no-head/index.html': page('<p>صفحة</p>'),
      },
      {
        '/ar/old/': { status: 301, headers: { location: '/ar/elsewhere/' } },
        '/ar/down/': { status: 503 },
        '/ar/no-head/': { headStatus: 405 },
      },
    )
    const report = await run(site)
    expect(schemaErrors(report)).toBe('')
    expect(report.scan).toMatchObject({ status: 'complete', notices: [] })
    expect(report.rules.map((rule) => [rule.id, rule.status])).toEqual([['link-rule', 'fail']])
    expect(report.findings.map((finding) => finding.evidence.values?.what)).toEqual([
      `GET 404 ${site.url('/ar/missing/')}`,
      `GET 503 ${site.url('/ar/down/')}`,
    ])
    expect(site.requests.slice(0, 2)).toEqual(['GET /robots.txt', 'GET /'])
    expect([...site.requests.slice(2)].sort()).toEqual(
      [
        'HEAD /ar/offers/',
        'HEAD /ar/missing/',
        'GET /ar/missing/',
        'HEAD /ar/old/',
        'HEAD /ar/down/',
        'GET /ar/down/',
        'HEAD /ar/no-head/',
        'GET /ar/no-head/',
      ].sort(),
    )
  })

  it('checks the first links alone, and says how many it left', async () => {
    const links = Array.from(
      { length: MAX_LINKS + 5 },
      (_, index) => `<a href="/p/${String(index)}">${String(index)}</a>`,
    ).join('')
    site = await tempSite({ 'index.html': page(links) })
    const report = await run(site)
    expect(site.requests.filter((request) => request.startsWith('HEAD '))).toHaveLength(MAX_LINKS)
    expect(site.requests).not.toContain(`HEAD /p/${String(MAX_LINKS)}`)
    expect(report.scan.notices.map((notice) => [notice.code, notice.message.en])).toEqual([
      [
        'links-limit',
        `The page links to ${String(MAX_LINKS + 5)} addresses on its own site: the scan checked the first ${String(MAX_LINKS)}, and not the other 5.`,
      ],
    ])
  })

  it('never asks for a link in a path robots.txt keeps ArablyzerBot from', async () => {
    site = await tempSite({
      'index.html': page('<a href="/ar/private/x">خاص</a><a href="/ar/open/">عام</a>'),
      'robots.txt':
        'User-agent: *\nDisallow: /\n\nUser-agent: ArablyzerBot\nDisallow: /ar/private/\n',
    })
    const report = await run(site)
    expect(site.requests).not.toContain('HEAD /ar/private/x')
    expect(site.requests).toContain('HEAD /ar/open/')
    expect(report.scan.notices.map((notice) => notice.code)).toEqual(['links-robots'])
    expect(report.scan.notices[0]?.message.en).toContain('ArablyzerBot')
  })

  it('does not judge a link that asks for fewer requests, and errs when none answered', async () => {
    site = await tempSite(
      { 'index.html': page('<a href="/ar/busy/">مشغولة</a>') },
      { '/ar/busy/': { status: 429 } },
    )
    const report = await run(site)
    expect(report.rules.map((rule) => [rule.id, rule.status, rule.error])).toEqual([
      ['link-rule', 'error', 'links-unchecked'],
    ])
    expect(report.scan).toMatchObject({ status: 'partial' })
    expect(report.scan.notices.map((notice) => notice.code)).toEqual(['links-unanswered'])
  })

  it('asks for no link when no rule reads them, and none for a page without any', async () => {
    site = await tempSite({ 'index.html': page('<a href="/ar/offers/">العروض</a>') })
    await run(site, [testRule({ detect: () => [] })])
    expect(site.requests).toEqual(['GET /robots.txt', 'GET /'])
    await site.close()
    site = await tempSite({ 'index.html': page('<a href="https://elsewhere.example/">خارج</a>') })
    const report = await run(site)
    expect(report.rules.map((rule) => rule.status)).toEqual(['not-applicable'])
    expect(site.requests).toEqual(['GET /robots.txt', 'GET /'])
  })
})

describe('evaluatePage: links', () => {
  it('finds the rules that read links not applicable, having no checks to read', () => {
    const facts = collectPage({
      url: 'https://shop.example/',
      status: 200,
      headers: [['content-type', 'text/html; charset=utf-8']],
      body: new TextEncoder().encode(page('<a href="/x">x</a>')),
    })
    expect(evaluatePage(facts, { rules: [linkRule] }).results[0]?.status).toBe('not-applicable')
  })
})

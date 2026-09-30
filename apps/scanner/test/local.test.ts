import { fileURLToPath } from 'node:url'
import type { ScanEvent } from '@arablyzer/api-contract'
import { createPolicy } from '@arablyzer/egress'
import { serveCrux, serveSite } from '@arablyzer/fixtures'
import { describe, expect, it } from 'vitest'
import { RULES } from '@arablyzer/rules'
import { eventOf } from '../src/events'
import { localScanner, optionsFor } from '../src/local'

const CLEAN_CONTACT = fileURLToPath(
  new URL('../../../fixtures/golden/sites/20-clean-contact/', import.meta.url),
)

/** rtl-check, as if one of its rules read `need` too. */
function rtlCheckNeeding(need: 'render' | 'crux') {
  return RULES.map((rule) =>
    rule.id === 'rtl-html-dir' ? { ...rule, needs: [...rule.needs, need] } : rule,
  )
}

describe('localScanner', () => {
  it('runs the engine on a golden page, its steps as the page reads them', async () => {
    const site = await serveSite(CLEAN_CONTACT)
    try {
      const seen: ScanEvent[] = []
      const report = await localScanner({
        policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
      })({ url: site.url('/') }, (event) => seen.push(event))
      expect(report.scan.status).toBe('complete')
      expect(report.target.url).toBe(site.url('/'))
      expect(seen[0]).toEqual({ type: 'started', engines: [] })
      // robots.txt first, in case it asks ArablyzerBot not to check the page (M2.4 plan §2).
      expect(seen[1]).toEqual({ type: 'robots', outcome: 'unavailable', status: 404 })
      expect(seen[2]).toEqual({
        type: 'page',
        status: 200,
        contentType: 'text/html; charset=utf-8',
        error: null,
        host: '127.0.0.1',
      })
      expect(seen.at(-1)?.type).toBe('rules')
    } finally {
      await site.close()
    }
  })

  it("runs a tool page's scan with the tool's rules alone", async () => {
    const site = await serveSite(CLEAN_CONTACT)
    try {
      const report = await localScanner({
        policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
      })({ url: site.url('/'), tool: 'rtl-check' }, () => undefined)
      expect(report.rules.map((rule) => rule.id).sort()).toEqual(['ar-html-lang', 'rtl-html-dir'])
    } finally {
      await site.close()
    }
  })

  it("sends the page to CrUX for a whole scan, and for a tool's only when its rules read it", async () => {
    const site = await serveSite(CLEAN_CONTACT)
    const crux = await serveCrux({ url: { lcp: 2_000, inp: 150, cls: 0.02 } })
    try {
      const options = {
        policy: createPolicy({
          allowTargets: [site.port, crux.port].map((port) => ({ address: '127.0.0.1', port })),
        }),
        crux: { apiKey: 'crux-test-key-9a2e', endpoint: crux.endpoint },
      }
      const run = (tool: string | undefined, rules = RULES) =>
        localScanner({ ...options, rules })(
          { url: site.url('/'), ...(tool === undefined ? {} : { tool }) },
          () => undefined,
        )
      await run('rtl-check')
      expect(crux.queries).toEqual([])
      await run(undefined)
      expect(crux.queries.map((query) => query.url)).toEqual([site.url('/')])
      await run('rtl-check', rtlCheckNeeding('crux'))
      expect(crux.queries.map((query) => query.url)).toEqual([site.url('/'), site.url('/')])
    } finally {
      await site.close()
      await crux.close()
    }
  })

  it('tells the page the host it was reached at, where there is one', () => {
    expect(
      eventOf({
        step: 'page',
        status: 200,
        contentType: 'text/html',
        error: null,
        host: 'www.shop.example',
      }),
    ).toEqual({
      type: 'page',
      status: 200,
      contentType: 'text/html',
      error: null,
      host: 'www.shop.example',
    })
    expect(
      eventOf({ step: 'page', status: null, contentType: null, error: 'connect-failed' }),
    ).toEqual({ type: 'page', status: null, contentType: null, error: 'connect-failed' })
  })

  it('names the engines the scan will render in when it starts', () => {
    expect(eventOf({ step: 'start', engines: ['chromium', 'webkit'] })).toEqual({
      type: 'started',
      engines: ['chromium', 'webkit'],
    })
  })
})

describe('optionsFor', () => {
  const render = { engines: ['chromium' as const] }
  const lab = {}
  const crux = { apiKey: 'crux-test-key-9a2e' }

  it('leaves a whole scan as it is', () => {
    const options = { render, lab, crux }
    expect(optionsFor(options, undefined)).toBe(options)
  })

  it('opens no browser, runs no lab and asks CrUX nothing, for a tool whose rules need none', () => {
    expect(optionsFor({ render, lab, crux }, 'rtl-check')).toEqual({
      ruleIds: ['rtl-html-dir', 'ar-html-lang'],
    })
  })

  it('asks CrUX for a tool whose rules read it', () => {
    const rules = rtlCheckNeeding('crux')
    expect(optionsFor({ rules, lab, crux }, 'rtl-check')).toEqual({
      rules,
      crux,
      ruleIds: ['rtl-html-dir', 'ar-html-lang'],
    })
  })

  it('renders for a tool whose rules need it, and refuses where there is no browser', () => {
    const rules = rtlCheckNeeding('render')
    expect(optionsFor({ rules, render, lab }, 'rtl-check')).toEqual({
      rules,
      render,
      ruleIds: ['rtl-html-dir', 'ar-html-lang'],
    })
    expect(() => optionsFor({ rules }, 'rtl-check')).toThrow(/runs no browser/)
  })

  it('refuses a tool there is none of', () => {
    expect(() => optionsFor({}, 'no-such-tool')).toThrow(/no tool no-such-tool/)
  })
})

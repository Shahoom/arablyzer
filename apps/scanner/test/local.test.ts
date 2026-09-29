import { fileURLToPath } from 'node:url'
import type { ScanEvent } from '@arablyzer/api-contract'
import { createPolicy } from '@arablyzer/egress'
import { serveSite } from '@arablyzer/fixtures'
import { describe, expect, it } from 'vitest'
import { RULES } from '@arablyzer/rules'
import { eventOf } from '../src/events'
import { localScanner, optionsFor } from '../src/local'

describe('localScanner', () => {
  it('runs the engine on a golden page, its steps as the page reads them', async () => {
    const site = await serveSite(
      fileURLToPath(new URL('../../../fixtures/golden/sites/20-clean-contact/', import.meta.url)),
    )
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
      })
      expect(seen.at(-1)?.type).toBe('rules')
    } finally {
      await site.close()
    }
  })

  it("runs a tool page's scan with the tool's rules alone", async () => {
    const site = await serveSite(
      fileURLToPath(new URL('../../../fixtures/golden/sites/20-clean-contact/', import.meta.url)),
    )
    try {
      const report = await localScanner({
        policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
      })({ url: site.url('/'), tool: 'rtl-check' }, () => undefined)
      expect(report.rules.map((rule) => rule.id).sort()).toEqual(['ar-html-lang', 'rtl-html-dir'])
    } finally {
      await site.close()
    }
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

  it('leaves a whole scan as it is', () => {
    const options = { render, lab }
    expect(optionsFor(options, undefined)).toBe(options)
  })

  it('opens no browser, and runs no lab, for a tool whose rules read no rendered page', () => {
    expect(optionsFor({ render, lab }, 'rtl-check')).toEqual({
      ruleIds: ['rtl-html-dir', 'ar-html-lang'],
    })
  })

  it('renders for a tool whose rules need it, and refuses where there is no browser', () => {
    // rtl-check, as if its rules read the rendered page.
    const rules = RULES.map((rule) =>
      rule.id === 'rtl-html-dir' ? { ...rule, needs: ['render' as const] } : rule,
    )
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

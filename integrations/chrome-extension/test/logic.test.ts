import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ApiError } from '@arablyzer/integrations-core'
import type { Report } from '@arablyzer/report-schema'
import { describe, expect, it } from 'vitest'
import {
  badgeFor,
  BADGE_COLORS,
  MAX_ROWS,
  presentReport,
  problemOf,
  scanTarget,
} from '../src/logic'
import { isApiKey, loadSettings, parseHost, pickLang, saveSettings } from '../src/settings'
import { memoryArea, KEY } from './mock-chrome'

const golden = (name: string): Report =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../../fixtures/golden/reports/${name}.json`, import.meta.url)),
      'utf8',
    ),
  ) as Report

describe('which page is scanned', () => {
  it('takes http and https pages, without the fragment', () => {
    expect(scanTarget('https://shop.example/ar/?q=1#top')).toBe('https://shop.example/ar/?q=1')
    expect(scanTarget('http://shop.example')).toBe('http://shop.example/')
  })
  it('takes nothing else', () => {
    for (const url of [
      undefined,
      '',
      'chrome://extensions',
      'chrome-extension://abc/popup.html',
      'file:///Users/me/page.html',
      'about:blank',
      'view-source:https://shop.example/',
      'https//broken',
    ]) {
      expect(scanTarget(url), String(url)).toBeNull()
    }
  })
})

describe('what is shown of a report', () => {
  it('gives the score, its band, the counts and the worst rules in the language chosen', () => {
    const report = golden('10-accessibility')
    const view = presentReport(report, 'https://arablyzer.com', 'en')
    expect(view.score).toBe(71)
    expect(view.band).toBe('mid')
    expect(view.counts.map((c) => c.severity)).toEqual([
      'critical',
      'serious',
      'moderate',
      'minor',
      'info',
    ])
    expect(view.counts[0]?.count).toBe(report.summary.bySeverity.critical)
    expect(view.issues.length).toBeLessThanOrEqual(MAX_ROWS)
    expect(view.issues[0]?.severity).toBe('critical')
    expect(view.issues[0]?.href).toBe(
      `https://arablyzer.com/en/rules/${view.issues[0]?.ruleId ?? ''}`,
    )
    const ar = presentReport(report, 'https://arablyzer.com', 'ar')
    expect(ar.issues[0]?.href).toBe(`https://arablyzer.com/rules/${ar.issues[0]?.ruleId ?? ''}`)
    expect(ar.issues[0]?.message).toBe(
      report.findings.find((f) => f.ruleId === ar.issues[0]?.ruleId)?.message.ar,
    )
    expect(view.issues.length + view.more).toBe(new Set(report.findings.map((f) => f.ruleId)).size)
  })

  it('shows a clean page with no rows, and a page with no score as such', () => {
    const clean = presentReport(golden('01-clean-store'), 'https://arablyzer.com', 'ar')
    expect(clean).toMatchObject({ score: 100, band: 'good', issues: [], more: 0 })
    const none = presentReport(golden('25-bot-challenge'), 'https://arablyzer.com', 'ar')
    expect(none.score).toBeNull()
    expect(none.band).toBeNull()
  })

  it('colours the badge by band, and marks a missing score', () => {
    expect(badgeFor(95)).toEqual({ text: '95', color: BADGE_COLORS.good })
    expect(badgeFor(60)).toEqual({ text: '60', color: BADGE_COLORS.mid })
    expect(badgeFor(10)).toEqual({ text: '10', color: BADGE_COLORS.low })
    expect(badgeFor(null).text).toBe('?')
  })
})

describe('what went wrong', () => {
  it('names the problem and keeps Retry-After', () => {
    expect(problemOf(new ApiError('rate_limited', 'x', 429, { retryAfterSeconds: 9 }))).toEqual({
      key: 'rate_limited',
      retryAfterSeconds: 9,
    })
    expect(problemOf(new ApiError('network', 'x', 0))).toEqual({ key: 'network' })
    expect(problemOf(new ApiError('not_found', 'x', 404))).toEqual({ key: 'unavailable' })
    expect(problemOf(new Error('boom'))).toEqual({ key: 'unavailable' })
  })
})

describe('settings', () => {
  it('accepts a key of the right shape only', () => {
    expect(isApiKey(KEY)).toBe(true)
    expect(isApiKey('arb_short')).toBe(false)
    expect(isApiKey(` ${KEY}`)).toBe(false)
  })

  it('accepts https services, and http only on this machine; never credentials', () => {
    expect(parseHost('https://arablyzer.com/')).toBe('https://arablyzer.com')
    expect(parseHost('https://arablyzer.example:8443/x?y')).toBe('https://arablyzer.example:8443')
    expect(parseHost('http://localhost:4321')).toBe('http://localhost:4321')
    expect(parseHost('http://127.0.0.1:3000/')).toBe('http://127.0.0.1:3000')
    expect(parseHost('http://arablyzer.example')).toBeNull()
    expect(parseHost('https://me:pw@arablyzer.example')).toBeNull()
    expect(parseHost('ftp://arablyzer.example')).toBeNull()
    expect(parseHost('nonsense')).toBeNull()
  })

  it('reads what is stored, with the odd falling back to the default', async () => {
    const area = memoryArea({ apiKey: KEY, host: 'https://arablyzer.example/', lang: 'en' })
    expect(await loadSettings(area)).toEqual({
      apiKey: KEY,
      host: 'https://arablyzer.example',
      lang: 'en',
    })
    const odd = memoryArea({ apiKey: 5, host: 'http://evil.example', lang: 'fr' })
    expect(await loadSettings(odd)).toEqual({
      apiKey: '',
      host: 'https://arablyzer.com',
      lang: 'auto',
    })
    expect(await loadSettings(memoryArea())).toEqual({
      apiKey: '',
      host: 'https://arablyzer.com',
      lang: 'auto',
    })
  })

  it('saves, and removes the key when it is empty', async () => {
    const area = memoryArea({ apiKey: KEY })
    await saveSettings(area, { apiKey: '', host: 'https://arablyzer.com', lang: 'ar' })
    expect(area.data).toEqual({ host: 'https://arablyzer.com', lang: 'ar' })
    await saveSettings(area, { apiKey: KEY, host: 'https://arablyzer.com', lang: 'auto' })
    expect(area.data.apiKey).toBe(KEY)
  })

  it('speaks the setting, or the browser’s language', () => {
    expect(pickLang('en', 'ar')).toBe('en')
    expect(pickLang('auto', 'ar-SA')).toBe('ar')
    expect(pickLang('auto', 'en-US')).toBe('en')
    expect(pickLang('auto', 'fr')).toBe('en')
  })
})

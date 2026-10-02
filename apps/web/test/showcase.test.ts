import { describe, expect, it } from 'vitest'
import { SHOWCASE, terminalLines } from '../src/lib/showcase'

// The home page's numbers are read from the golden reports; these are the ones the owner
// approved in the design (M2.1 plan §0). If a golden report changes, this test says so, and the
// page follows the report, never the other way round.
describe('the showcase', () => {
  it('reads the instrument panel from golden report 04', () => {
    expect(SHOWCASE.page).toBe('04-rtl-layout')
    expect(SHOWCASE.heading).toEqual({ text: 'متجر العطور', selector: 'html > body > main > h1' })
    expect([SHOWCASE.score, SHOWCASE.failed, SHOWCASE.passed]).toEqual([91, 3, 21])
    expect(SHOWCASE.engines).toEqual([
      { engine: 'chromium', name: 'Chromium', version: '153', joined: true },
      { engine: 'firefox', name: 'Firefox', version: '155', joined: true },
      { engine: 'webkit', name: 'WebKit', version: '26.6', joined: false },
    ])
    expect(SHOWCASE.spacing.px).toBe(3.2)
    expect(SHOWCASE.spacing.drawnBy).toEqual(['webkit'])
  })

  // M2.6 R2: the home page's product shot is this report as a visitor's report shows it, so every
  // number on it is one of these.
  it('reads the rest of the report the product shot draws: severities, categories, third finding', () => {
    expect(SHOWCASE.notApplicable).toBe(37)
    expect(SHOWCASE.bySeverity).toEqual({ critical: 0, serious: 1, moderate: 1, minor: 0, info: 1 })
    expect(SHOWCASE.categories).toMatchObject({
      rtl: 67,
      'ar-render': 0,
      'ar-content': 100,
      index: 100,
    })
    // A category with no score (no rule of it had weight and applied) is not a score of 0.
    expect(SHOWCASE.categories).not.toHaveProperty('forms')
    expect(SHOWCASE.categories).not.toHaveProperty('commerce')
    expect(SHOWCASE.overflow.engines).toEqual(['chromium', 'firefox', 'webkit'])
    expect(SHOWCASE.physical.count).toBe(5)
    expect(SHOWCASE.physical.title).toEqual({
      ar: 'CSS يحدد الجهات باليمين واليسار',
      en: 'CSS that sets sides by left and right',
    })
    expect(SHOWCASE.physical.finding.severity).toBe('info')
  })

  it('reads the four Arabic-layer findings with their evidence', () => {
    const { overflow, name, price } = SHOWCASE
    expect([overflow.overflow, overflow.viewport, overflow.x, overflow.width]).toEqual([
      280, 390, -280, 260,
    ])
    expect(overflow.element).toBe('nav')
    expect(name).toMatchObject({
      label: 'الاسم الكامل',
      name: 'محمد العبري',
      accepted: 'Omar Alabri',
      pattern: '[A-Za-z ]{3,40}',
    })
    expect([price.price, price.fixed]).toEqual(['12.50 ر.ع.', '12.500 ر.ع.'])
    for (const finding of [SHOWCASE.spacing, overflow, name, price].map((item) => item.finding)) {
      expect(finding.message.ar).not.toBe('')
      expect(finding.message.en).not.toBe('')
    }
  })

  it('prints what the CLI prints, without the zeroed timings and the notices', () => {
    for (const lang of ['ar', 'en'] as const) {
      const lines = terminalLines(lang)
      expect(lines[0]).toBe('Arablyzer 0.1.0 · http://127.0.0.1:30004/')
      expect(lines.join('\n')).not.toMatch(/0\.0 s/)
      expect(lines.filter((line) => line.startsWith('✗'))).toHaveLength(3)
      expect(lines.at(-1)).not.toBe('')
    }
    expect(terminalLines('ar').slice(1, 3)).toEqual([
      '3 فشلت · 21 نجحت · 37 لا تنطبق',
      'الدرجة 91 من 100',
    ])
    expect(terminalLines('en').slice(1, 3)).toEqual([
      '3 failed · 21 passed · 37 not applicable',
      'Score 91/100',
    ])
  })
})

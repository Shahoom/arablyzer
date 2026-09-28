import { describe, expect, it } from 'vitest'
import { SHOWCASE, terminalLines } from '../src/lib/showcase'

// The home page's numbers are read from the golden reports; these are the ones the owner
// approved in the design (M2.1 plan §0). If a golden report changes, this test says so, and the
// page follows the report, never the other way round.
describe('the showcase', () => {
  it('reads the instrument panel from golden report 04', () => {
    expect(SHOWCASE.page).toBe('04-rtl-layout')
    expect(SHOWCASE.heading).toEqual({ text: 'متجر العطور', selector: 'html > body > main > h1' })
    expect([SHOWCASE.score, SHOWCASE.failed, SHOWCASE.passed]).toEqual([90, 3, 18])
    expect(SHOWCASE.engines).toEqual([
      { engine: 'chromium', name: 'Chromium', version: '153', joined: true },
      { engine: 'firefox', name: 'Firefox', version: '155', joined: true },
      { engine: 'webkit', name: 'WebKit', version: '26.6', joined: false },
    ])
    expect(SHOWCASE.spacing.px).toBe(3.2)
    expect(SHOWCASE.spacing.drawnBy).toEqual(['webkit'])
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
      '3 فشلت · 18 نجحت · 26 لا تنطبق',
      'الدرجة 90 من 100',
    ])
    expect(terminalLines('en').slice(1, 3)).toEqual([
      '3 failed · 18 passed · 26 not applicable',
      'Score 90/100',
    ])
  })
})

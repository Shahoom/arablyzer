import { describe, expect, it } from 'vitest'
import { toA11yFacts } from '../../src/a11y'
import { toFacts } from '../../src/index'

const box = { x: 0, y: 0, width: 10, height: 10 }

const measured = {
  dir: 'rtl',
  lang: 'ar',
  viewportMeta: 'width=device-width',
  viewport: { width: 390, height: 844 },
  scrollWidth: 390,
  overflow: [],
  arabicText: [
    {
      selector: '#a',
      box,
      text: 'نص',
      letterSpacing: 0,
      letterSpacingApplied: null,
      fontFamily: 'serif',
      primaryFamily: 'serif',
    },
  ],
  arabicTextOmitted: 0,
  fontFaces: [],
  bidi: [],
  fields: [],
  truncated: false,
}

const context = {
  engine: 'chromium' as const,
  version: '153.0',
  url: 'https://example.com/',
  status: 200,
  fontRequests: [],
  limited: false,
}

describe('toFacts: the page script’s result, checked before any rule reads it', () => {
  it('turns a well-formed result into RenderedFacts', () => {
    expect(toFacts(measured, context)).toMatchObject({
      engine: 'chromium',
      version: '153.0',
      status: 200,
      dir: 'rtl',
      arabicText: [{ selector: '#a', text: 'نص' }],
      truncated: false,
    })
    expect('usedFonts' in toFacts(measured, context)).toBe(false)
  })

  it.each([
    ['an unknown direction', { ...measured, dir: 'sideways' }],
    [
      'a selector past 300 characters',
      { ...measured, overflow: [{ selector: 'a'.repeat(301), box }] },
    ],
    [
      'text past its bound',
      { ...measured, arabicText: [{ ...measured.arabicText[0], text: 'ن'.repeat(201) }] },
    ],
    ['a fractional pixel', { ...measured, overflow: [{ selector: 'a', box: { ...box, x: 0.5 } }] }],
    [
      'more tokens than the script keeps',
      {
        ...measured,
        bidi: Array.from({ length: 21 }, () => ({
          selector: 'p',
          box,
          text: 'C++',
          kind: 'latin',
        })),
      },
    ],
    ['an extra field', { ...measured, cookies: 'x' }],
    ['something that is not an object', 'rendered'],
  ])('rejects %s, as a page that meddled with the script could return', (_name, value) => {
    expect(() => toFacts(value, context)).toThrow()
  })
})

describe('toFacts: text fields', () => {
  const field = {
    selector: '#phone',
    box,
    tag: 'input',
    type: 'text',
    name: 'phone',
    id: 'phone',
    autocomplete: ['tel'],
    inputmode: 'tel',
    placeholder: '9xxxxxxx',
    label: 'رقم الجوال',
    ariaLabel: null,
    dirAttribute: null,
    direction: 'rtl',
    unicodeBidi: 'normal',
  }

  it('keeps each field with its computed direction, and axe’s results as given', () => {
    const facts = toFacts({ ...measured, fields: [field] }, context)
    expect(facts.fields).toEqual([field])
    expect(facts.a11y).toBeNull()
  })

  it('refuses directions that are not ltr or rtl, and more fields than the script keeps', () => {
    expect(() =>
      toFacts({ ...measured, fields: [{ ...field, direction: 'up' }] }, context),
    ).toThrow()
    expect(() =>
      toFacts({ ...measured, fields: Array.from({ length: 201 }, () => field) }, context),
    ).toThrow()
  })
})

describe('toA11yFacts: axe’s results, checked before any rule reads them', () => {
  const node = { selector: '#low', snippet: '<p id="low">نص</p>', reason: null, contrast: null }
  const rule = {
    id: 'color-contrast',
    applicable: true,
    violations: [node],
    violationCount: 1,
    incomplete: [],
    incompleteCount: 0,
  }

  it('keeps the curated rules’ results, with axe’s version', () => {
    const facts = toA11yFacts({ rules: [rule] })
    expect(facts.rules).toEqual([rule])
    expect(facts.axeVersion).toBe('4.13.0')
  })

  it('refuses rules axe was not asked for, too many nodes, and long snippets', () => {
    expect(() => toA11yFacts({ rules: [{ ...rule, id: 'region' }] })).toThrow()
    expect(() =>
      toA11yFacts({ rules: [{ ...rule, violations: Array.from({ length: 21 }, () => node) }] }),
    ).toThrow()
    expect(() =>
      toA11yFacts({ rules: [{ ...rule, violations: [{ ...node, snippet: 'x'.repeat(201) }] }] }),
    ).toThrow()
  })
})

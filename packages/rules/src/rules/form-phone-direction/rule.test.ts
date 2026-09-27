import type { RenderedFieldFact } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, renderedEvidence, renderedFacts } from '../../../test/helpers'
import { rule } from './rule'

const phone = (overrides: Partial<RenderedFieldFact> = {}): RenderedFieldFact => ({
  selector: '#phone',
  box: { x: 20, y: 120, width: 300, height: 32 },
  tag: 'input',
  type: 'text',
  name: 'phone',
  id: 'phone',
  autocomplete: [],
  inputmode: null,
  placeholder: null,
  label: null,
  ariaLabel: null,
  dirAttribute: null,
  direction: 'rtl',
  unicodeBidi: 'normal',
  ...overrides,
})
const evidence = (...fields: RenderedFieldFact[]) =>
  renderedEvidence([renderedFacts('chromium', { fields })])

describe('form-phone-direction', () => {
  it('reports a phone field shown right to left, once for all engines', () => {
    const field = phone({ autocomplete: ['tel'], inputmode: 'tel', label: 'رقم الجوال' })
    const both = renderedEvidence([
      renderedFacts('chromium', { fields: [field] }),
      renderedFacts('firefox', { fields: [field] }),
    ])
    expect(applies(rule, both)).toBe(true)
    expect(detectAll(rule, both)).toEqual([
      {
        message: 'reversed',
        selector: '#phone',
        engines: ['chromium', 'firefox'],
        box: { x: 20, y: 120, width: 300, height: 32 },
      },
    ])
  })

  it('finds phone fields by type, keyboard, autocomplete, name, id, label or placeholder', () => {
    for (const field of [
      phone({ name: null, id: null, type: 'tel' }),
      phone({ name: null, id: null, inputmode: 'tel' }),
      phone({ name: null, id: null, autocomplete: ['shipping', 'tel-national'] }),
      phone({ name: 'billing_phone', id: null }),
      phone({ name: null, id: 'mobileNumber' }),
      phone({ name: null, id: null, label: 'رقم الهاتف' }),
      phone({ name: null, id: null, placeholder: 'واتساب' }),
    ]) {
      expect(detectAll(rule, evidence(field)), JSON.stringify(field)).toHaveLength(1)
    }
  })

  it('passes fields shown left to right, or that take their direction from what is typed', () => {
    for (const field of [
      phone({ direction: 'ltr' }),
      phone({ dirAttribute: 'auto' }),
      phone({ unicodeBidi: 'plaintext' }),
      phone({ type: 'number' }),
      phone({ tag: 'textarea', type: 'textarea' }),
    ]) {
      expect(detectAll(rule, evidence(field)), JSON.stringify(field)).toEqual([])
    }
  })

  it('applies only to pages with a phone field', () => {
    expect(applies(rule, evidence(phone()))).toBe(true)
    expect(applies(rule, evidence(phone({ name: 'city', id: 'city' })))).toBe(false)
    expect(applies(rule, evidence())).toBe(false)
  })
})

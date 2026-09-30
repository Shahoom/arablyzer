import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  fromPage,
  MAX_RESULT_LENGTH,
  RESULT_GUARD,
  RESULT_GUARD_NAME,
  throughGuard,
} from '../../src/guard'

/** A context standing in for a page's world, with the guard run before the page's scripts. */
function pageWorld(): vm.Context {
  const context = vm.createContext({})
  vm.runInContext('globalThis.window = globalThis', context)
  vm.runInContext(RESULT_GUARD, context)
  return context
}

const hand = (context: vm.Context, expression: string): unknown =>
  vm.runInContext(`${RESULT_GUARD_NAME}(${expression})`, context)

describe('the result guard', () => {
  it('hands a small result over as JSON text, which fromPage reads back', () => {
    const handed = hand(pageWorld(), '{ dir: "rtl", blocks: [1, 2] }')
    expect(typeof handed).toBe('string')
    expect(fromPage(handed)).toEqual({ dir: 'rtl', blocks: [1, 2] })
  })

  it('hands over a short note instead of text longer than the limit', () => {
    const handed = hand(pageWorld(), `{ text: "x".repeat(${MAX_RESULT_LENGTH}) }`)
    expect(handed).toEqual({ tooLong: MAX_RESULT_LENGTH + 11 })
    expect(() => fromPage(handed)).toThrow(/over the limit/)
  })

  it('says when a result cannot be serialized', () => {
    const handed = hand(
      pageWorld(),
      '(() => { const cycle = {}; cycle.self = cycle; return cycle })()',
    )
    expect(handed).toEqual({ unreadable: true })
    expect(() => fromPage(handed)).toThrow(/could not be read/)
  })

  it('keeps JSON.stringify as it was before the page replaced it', () => {
    const context = pageWorld()
    vm.runInContext('JSON.stringify = () => "x".repeat(10)', context)
    expect(fromPage(hand(context, '{ ok: true }'))).toEqual({ ok: true })
  })

  it('cannot be replaced or removed by the page', () => {
    const context = pageWorld()
    vm.runInContext(
      `window.${RESULT_GUARD_NAME} = () => "forged"; delete window.${RESULT_GUARD_NAME}`,
      context,
    )
    expect(() => {
      vm.runInContext(
        `Object.defineProperty(window, '${RESULT_GUARD_NAME}', { value: () => 1 })`,
        context,
      )
    }).toThrow()
    expect(fromPage(hand(context, '[1]'))).toEqual([1])
  })

  it('hands over what an expression resolves to', async () => {
    const context = pageWorld()
    const handed: unknown = await vm.runInContext(
      throughGuard('Promise.resolve({ later: 1 })'),
      context,
    )
    expect(fromPage(handed)).toEqual({ later: 1 })
  })
})

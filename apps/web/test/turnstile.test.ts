import { TURNSTILE_ACTION } from '@arablyzer/api-contract/codes'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { challenge } from '../src/islands/turnstile'

// The widget the site renders, as Cloudflare's script would: it records what it was rendered
// with, and answers a challenge at once.
function widget() {
  const rendered: { container: unknown; params: Record<string, unknown> }[] = []
  const api = {
    render: (container: unknown, params: Record<string, unknown>) => {
      rendered.push({ container, params })
      return 'widget-1'
    },
    execute: () => {
      const callback = rendered[0]?.params.callback as (token: string) => void
      callback('the-token')
    },
    reset: () => undefined,
  }
  vi.stubGlobal('window', { turnstile: api })
  return rendered
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the Turnstile widget', () => {
  // Issue #30: the API asks Cloudflare's answer to name the action, so a token made for another
  // widget of the same site key is refused: the widget must set the action the API asks for.
  it('is rendered for the scan action, which the API binds', async () => {
    const rendered = widget()
    const container = {} as HTMLElement
    const check = challenge('a-site-key', () => container, 'ar')
    expect(await check.token()).toBe('the-token')
    expect(rendered).toHaveLength(1)
    expect(rendered[0]?.container).toBe(container)
    expect(rendered[0]?.params).toMatchObject({
      sitekey: 'a-site-key',
      action: TURNSTILE_ACTION,
      language: 'ar',
    })
  })

  it('gives an empty token where the site has no key, which the API takes only in development', async () => {
    const rendered = widget()
    expect(await challenge(undefined, () => null, 'en').token()).toBe('')
    expect(await challenge('', () => null, 'en').token()).toBe('')
    expect(rendered).toEqual([])
  })
})

/**
 * Cloudflare Turnstile on the scan form (BUILD-PLAN §13): its script loads only when a visitor
 * starts on the form, so the page loads without it, and its box shows only when Cloudflare needs
 * the visitor to act. Without a site key (development, and tests), there is no check and the
 * token is empty, which the API accepts only where TURNSTILE_SECRET is unset.
 */

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface TurnstileApi {
  render(container: HTMLElement, params: Record<string, unknown>): string
  execute(widget: string): void
  reset(widget: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let loading: Promise<TurnstileApi> | null = null

function load(): Promise<TurnstileApi> {
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    if (window.turnstile !== undefined) {
      resolve(window.turnstile)
      return
    }
    const script = document.createElement('script')
    script.src = SCRIPT
    script.async = true
    script.onload = () => {
      if (window.turnstile === undefined) reject(new Error('Turnstile did not load'))
      else resolve(window.turnstile)
    }
    script.onerror = () => {
      loading = null
      reject(new Error('Turnstile did not load'))
    }
    document.head.append(script)
  })
  return loading
}

export interface Challenge {
  /** Loads the script early, when the visitor starts on the form. */
  warm(): void
  /** A fresh token: each is good for one scan. */
  token(): Promise<string>
}

export function challenge(
  siteKey: string | undefined,
  container: () => HTMLElement | null,
  lang: string,
): Challenge {
  if (siteKey === undefined || siteKey === '') {
    return { warm: () => undefined, token: () => Promise.resolve('') }
  }
  let widget: string | null = null
  let pending: { resolve: (token: string) => void; reject: (error: Error) => void } | null = null
  const settle = (outcome: string | Error) => {
    const waiting = pending
    pending = null
    if (outcome instanceof Error) waiting?.reject(outcome)
    else waiting?.resolve(outcome)
  }
  const ready = async (): Promise<{ api: TurnstileApi; widget: string }> => {
    const api = await load()
    const element = container()
    if (element === null) throw new Error('No place for Turnstile')
    widget ??= api.render(element, {
      sitekey: siteKey,
      language: lang,
      execution: 'execute',
      appearance: 'interaction-only',
      callback: (token: string) => {
        settle(token)
      },
      // Every way the check can end without a token ends the wait too, so the form never stays
      // busy: an error, a challenge left unanswered, a browser Turnstile does not support.
      'error-callback': () => {
        settle(new Error('Turnstile failed'))
      },
      'timeout-callback': () => {
        settle(new Error('Turnstile timed out'))
      },
      'unsupported-callback': () => {
        settle(new Error('Turnstile is not supported here'))
      },
      'expired-callback': () => {
        if (widget !== null) api.reset(widget)
      },
    })
    return { api, widget }
  }
  return {
    warm: () => {
      void load().catch(() => undefined)
    },
    token: async () => {
      const { api, widget: id } = await ready()
      const token = new Promise<string>((resolve, reject) => {
        pending = { resolve, reject }
      })
      api.reset(id)
      api.execute(id)
      return token
    },
  }
}

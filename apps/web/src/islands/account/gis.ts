/**
 * Google Identity Services: the script that draws Google's own "Sign in with Google" button and
 * One Tap. It loads from Google only on the sign-in and account pages, and only for a visitor who
 * is not signed in; no other page of the site loads it (the home page and the tools carry no
 * account script at all). The ID token it hands the page goes to our API, which checks it
 * against Google's keys (apps/api/src/auth.ts).
 */

const SCRIPT = 'https://accounts.google.com/gsi/client'
/** How long the script may take before the page offers Google's own page instead. */
const LOAD_TIMEOUT_MS = 8_000

export interface CredentialResponse {
  readonly credential?: string
}

export interface GoogleId {
  initialize(config: {
    client_id: string
    callback: (response: CredentialResponse) => void
    auto_select?: boolean
    cancel_on_tap_outside?: boolean
    use_fedcm_for_prompt?: boolean
    itp_support?: boolean
    context?: 'signin' | 'signup' | 'use'
  }): void
  renderButton(
    parent: HTMLElement,
    options: {
      type: 'standard'
      theme: 'outline' | 'filled_blue' | 'filled_black'
      size: 'large' | 'medium' | 'small'
      text: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
      shape: 'rectangular' | 'pill'
      logo_alignment: 'left' | 'center'
      width?: number
      locale?: string
    },
  ): void
  prompt(): void
  cancel(): void
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } }
  }
}

let loading: Promise<GoogleId> | null = null

/** Google's script, loaded once; rejects when it cannot load (blocked, offline, too slow). */
export function loadGsi(): Promise<GoogleId> {
  loading ??= new Promise<GoogleId>((resolve, reject) => {
    const ready = window.google?.accounts?.id
    if (ready !== undefined) {
      resolve(ready)
      return
    }
    const fail = () => {
      loading = null
      reject(new Error('Google Identity Services did not load'))
    }
    const timer = window.setTimeout(fail, LOAD_TIMEOUT_MS)
    const script = document.createElement('script')
    script.src = SCRIPT
    script.async = true
    script.onload = () => {
      window.clearTimeout(timer)
      const api = window.google?.accounts?.id
      if (api === undefined) fail()
      else resolve(api)
    }
    script.onerror = () => {
      window.clearTimeout(timer)
      fail()
    }
    document.head.append(script)
  })
  return loading
}

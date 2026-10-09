import { ACCOUNT_UI } from '@arablyzer/i18n/account'
import type { Language } from '@arablyzer/api-contract/codes'
import { useEffect, useRef, useState } from 'preact/hooks'
import { loadGsi } from './gis'

interface Props {
  lang: Language
  clientId: string
  /** Google's ID token, from the button or from One Tap. */
  onCredential: (credential: string) => void
  /** The person chose Google's own page instead (the button could not load, or never will). */
  onRedirect: () => void
  disabled: boolean
}

/** Google's multicolour "G", as its branding guidelines give it. */
function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

/**
 * Sign-in with Google: Google's own button and One Tap (an instant sign-in where the browser
 * offers it), both giving this page an ID token. If Google's script cannot load (blocked, offline),
 * a button of ours in Google's colours takes the visitor to Google's own page instead, which
 * needs no script of theirs on ours.
 */
export default function GoogleSignIn({
  lang,
  clientId,
  onCredential,
  onRedirect,
  disabled,
}: Props) {
  const t = ACCOUNT_UI[lang].login
  const slot = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'loading' | 'google' | 'fallback'>('loading')
  // The callbacks change with the page's state; Google is given one function that reads the latest.
  const latest = useRef(onCredential)
  latest.current = onCredential

  useEffect(() => {
    let cancelled = false
    let api: Awaited<ReturnType<typeof loadGsi>> | null = null
    loadGsi().then(
      (loaded) => {
        if (cancelled || slot.current === null) return
        api = loaded
        loaded.initialize({
          client_id: clientId,
          callback: (response) => {
            if (typeof response.credential === 'string' && response.credential !== '') {
              latest.current(response.credential)
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: true,
          itp_support: true,
          context: 'signin',
        })
        loaded.renderButton(slot.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: Math.min(360, Math.max(200, slot.current.offsetWidth)),
          locale: lang,
        })
        loaded.prompt()
        setMode('google')
      },
      () => {
        if (!cancelled) setMode('fallback')
      },
    )
    return () => {
      cancelled = true
      api?.cancel()
    }
  }, [clientId, lang])

  return (
    <div className="flex flex-col gap-3">
      {/* Google draws its button here, in its own frame, at most 400 px wide. */}
      <div
        ref={slot}
        dir="ltr"
        className={
          mode === 'fallback' ? 'hidden' : 'flex min-h-11 w-full max-w-[360px] items-center'
        }
        aria-busy={mode === 'loading'}
      />
      {mode === 'loading' && (
        <p role="status" className="m-0 text-meta text-ink-2">
          {t.preparing}
        </p>
      )}
      {mode === 'fallback' && (
        <>
          <p role="status" className="m-0 text-small text-ink-2">
            {t.fallback}
          </p>
          {/* Google's brand button: white, a grey edge, its "G", 14 px text; 44 px high. */}
          <button
            type="button"
            onClick={onRedirect}
            disabled={disabled}
            className="inline-flex h-11 w-full max-w-[360px] cursor-pointer items-center justify-center gap-2.5 rounded-md border border-[#747775] bg-white px-3 text-[14px] font-semibold text-[#1f1f1f] hover:bg-[#f2f2f2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo disabled:cursor-not-allowed disabled:opacity-60"
          >
            <GoogleG />
            <span>{t.google}</span>
          </button>
        </>
      )}
    </div>
  )
}

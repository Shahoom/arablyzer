import { reader, type Env } from './reader'

/** The accounts switch: off unless this is `on`; with it off every account route is a 404. */
export const ACCOUNTS_VARIABLE = 'ARABLYZER_ACCOUNTS'
export type AccountsMode = 'on' | 'off'

export function accountsModeFrom(env: Env): AccountsMode {
  const raw = env[ACCOUNTS_VARIABLE]?.trim()
  if (raw === undefined || raw === '' || raw === 'off') return 'off'
  if (raw === 'on') return 'on'
  throw new Error(`${ACCOUNTS_VARIABLE} is on or off, not ${raw}`)
}

/** A window of requests; the same shape as the scan limits' (`scans` counts requests here). */
interface RequestWindow {
  readonly scans: number
  readonly seconds: number
}

/**
 * The abuse limits of the sign-in routes. M4.1 signs in with Google alone, so one window: the
 * requests a visitor makes to those routes, valid or not. The per-address and the sender's
 * windows the emailed link needs (docs/design/plans/m4.1-accounts.md, contracts) join here when
 * that path is built.
 */
export interface AuthLimits {
  readonly signIn: RequestWindow
}

export const DEVELOPMENT_AUTH_LIMITS: AuthLimits = Object.freeze({
  signIn: Object.freeze({ scans: 20, seconds: 600 }),
})

export function authLimitsFrom(env: Env): AuthLimits {
  const read = reader(env, 'Phase 4 design §2.4')
  const d = DEVELOPMENT_AUTH_LIMITS
  return Object.freeze({
    signIn: Object.freeze({
      scans: read('ARABLYZER_LIMIT_SIGNIN_REQUESTS', d.signIn.scans),
      seconds: read('ARABLYZER_LIMIT_SIGNIN_SECONDS', d.signIn.seconds),
    }),
  })
}

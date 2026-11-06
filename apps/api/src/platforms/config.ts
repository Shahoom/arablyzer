import { createHmac, randomBytes } from 'node:crypto'
import type { EgressPolicy, Resolver, safeFetch } from '@arablyzer/egress'
import { quietly, requireSecret, type Handoff, type PlatformData } from '@arablyzer/store'
import { sealKeyFrom } from './crypto'
import { platformHttp } from './http'
import { createSalla, type SallaSettings } from './salla'
import { PLATFORMS_PATH, type PlatformsDeps } from './routes'
import type { PlatformContext } from './types'
import { createZid, type ZidSettings } from './zid'

type Env = Readonly<Record<string, string | undefined>>

// The Salla and Zid apps (M9, issue #41). Each is off unless its variable says `on`; off, none of
// its routes exist and nothing of it runs. On, everything it needs must be set, and the start says
// which is not (never the value).

export const SALLA_VARIABLE = 'ARABLYZER_SALLA'
export const ZID_VARIABLE = 'ARABLYZER_ZID'
/** Seals the stores' tokens; shared by both apps. */
export const PLATFORM_SECRET_VARIABLE = 'ARABLYZER_PLATFORM_SECRET'

function modeOf(env: Env, name: string): boolean {
  const raw = env[name]?.trim()
  if (raw === undefined || raw === '' || raw === 'off') return false
  if (raw === 'on') return true
  throw new Error(`${name} is on or off, not ${raw}`)
}

const required = (env: Env, name: string, minimum = 1): string => {
  const value = env[name]?.trim() ?? ''
  if (value === '') throw new Error(`${name} must be set when its app is on`)
  if (value.length < minimum)
    throw new Error(`${name} must be ${String(minimum)} characters or more`)
  return value
}

/** The apps' settings from the environment, or undefined when both are off. */
export function platformsFrom(
  env: Env,
  options: {
    readonly production: boolean
    readonly siteUrl: URL | undefined
    readonly data: PlatformData | undefined
    readonly handoff: Handoff | undefined
    /** The limiter's secret: the flow's cookie is signed with a key derived from it. */
    readonly limiterKey: string
    readonly policy: EgressPolicy
    readonly resolver: Resolver
    readonly fetcher: typeof safeFetch | undefined
    readonly newId: () => string
    readonly now?: () => Date
    readonly log: (message: string) => void
  },
): PlatformsDeps | undefined {
  const sallaOn = modeOf(env, SALLA_VARIABLE)
  const zidOn = modeOf(env, ZID_VARIABLE)
  if (!sallaOn && !zidOn) return undefined
  const names = [sallaOn ? SALLA_VARIABLE : '', zidOn ? ZID_VARIABLE : '']
    .filter((name) => name !== '')
    .join(' and ')
  const { siteUrl, data, handoff } = options
  if (siteUrl === undefined) throw new Error(`${names} needs ARABLYZER_SITE`)
  if (data === undefined)
    throw new Error(`${names} needs a store for the apps (stores.platformData)`)
  if (handoff === undefined)
    throw new Error(`${names} needs the store for one-time values (stores.handoff)`)
  let secret = env[PLATFORM_SECRET_VARIABLE]?.trim() ?? ''
  if (options.production) secret = requireSecret(PLATFORM_SECRET_VARIABLE, secret)
  else if (secret === '') secret = randomBytes(32).toString('base64url')

  const context: PlatformContext = {
    data,
    sealKey: sealKeyFrom(secret),
    http: platformHttp({
      policy: options.policy,
      resolver: options.resolver,
      ...(options.fetcher === undefined ? {} : { fetcher: options.fetcher }),
    }),
    now: options.now ?? (() => new Date()),
    newId: options.newId,
    log: quietly('Platforms', options.log),
  }
  const redirect = (platform: string) => `${siteUrl.origin}${PLATFORMS_PATH}/${platform}/callback`

  let salla: ReturnType<typeof createSalla> | undefined
  if (sallaOn) {
    const raw = env.ARABLYZER_SALLA_WEBHOOK_STRATEGY?.trim() ?? ''
    const strategy = raw === '' ? 'signature' : raw
    if (strategy !== 'signature' && strategy !== 'token') {
      throw new Error(`ARABLYZER_SALLA_WEBHOOK_STRATEGY is signature or token, not ${strategy}`)
    }
    const settings: SallaSettings = {
      clientId: required(env, 'ARABLYZER_SALLA_CLIENT_ID'),
      clientSecret: required(env, 'ARABLYZER_SALLA_CLIENT_SECRET'),
      appId: required(env, 'ARABLYZER_SALLA_APP_ID'),
      webhookSecret: required(env, 'ARABLYZER_SALLA_WEBHOOK_SECRET', 16),
      webhookStrategy: strategy,
      redirectUri: redirect('salla'),
    }
    salla = createSalla(context, settings)
  }
  let zid: ReturnType<typeof createZid> | undefined
  if (zidOn) {
    const settings: ZidSettings = {
      clientId: required(env, 'ARABLYZER_ZID_CLIENT_ID'),
      clientSecret: required(env, 'ARABLYZER_ZID_CLIENT_SECRET'),
      appId: required(env, 'ARABLYZER_ZID_APP_ID'),
      // Chosen by the owner, and the only thing that tells Zid's calls from anyone's.
      webhookSecret: requireSecret(
        'ARABLYZER_ZID_WEBHOOK_SECRET',
        env.ARABLYZER_ZID_WEBHOOK_SECRET,
      ),
      redirectUri: redirect('zid'),
    }
    zid = createZid(context, settings)
  }
  options.log(
    `Store apps are on: ${[salla ? 'Salla' : '', zid ? 'Zid' : ''].filter(Boolean).join(' and ')}.`,
  )
  return {
    origin: siteUrl.origin,
    secure: siteUrl.protocol === 'https:',
    // Derived from the limiter's secret, for this use alone, as the Search Console cookie's is.
    signingKey: createHmac('sha256', options.limiterKey)
      .update('arablyzer platform flow cookie')
      .digest(),
    context,
    handoff,
    ...(salla === undefined ? {} : { salla }),
    ...(zid === undefined ? {} : { zid }),
  }
}

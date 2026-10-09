import { memoryAdapter } from 'better-auth/adapters/memory'
import { createAuth } from '../../src/auth'

// Run as a child process by egress-proxy.test.ts, with NODE_USE_ENV_PROXY=1 and HTTPS_PROXY set:
// a Google sign-in whose callback makes the library call Google's token endpoint with the real,
// unstubbed `fetch`. Prints what the callback answered.
const site = new URL('https://arablyzer.example')
const auth = createAuth({
  site,
  secret: 'a'.repeat(40),
  database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
  google: { clientId: 'test.apps.googleusercontent.com', clientSecret: 'test-secret' },
  production: false,
  log: () => undefined,
})
const start = await auth.api.signInSocial({
  body: {
    provider: 'google',
    callbackURL: '/account',
    errorCallbackURL: '/login',
    disableRedirect: true,
  },
  asResponse: true,
})
const { url } = (await start.json()) as { url: string }
const state = new URL(url).searchParams.get('state') ?? ''
const cookie = start.headers
  .getSetCookie()
  .map((line) => line.split(';')[0])
  .join('; ')
const back = await auth.handler(
  new Request(`${site.origin}/api/auth/callback/google?code=made-up&state=${state}`, {
    headers: { cookie },
    redirect: 'manual',
  }),
)
console.log(
  JSON.stringify({
    status: back.status,
    location: back.headers.get('location'),
    session: back.headers.getSetCookie().some((line) => line.includes('session_token=')),
  }),
)

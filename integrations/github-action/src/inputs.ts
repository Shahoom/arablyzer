import { API_KEY_PATTERN } from '@arablyzer/api-contract/codes'
import { DEFAULT_ORIGIN, type FailOn, type SiteLang } from '@arablyzer/integrations-core'
import { isAbsolute, relative, resolve } from 'node:path'

/** A setting the workflow got wrong; the message says which and how. */
export class InputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InputError'
  }
}

export interface Inputs {
  readonly urls: readonly string[]
  readonly apiKey: string
  /** The site's origin, without a trailing slash. */
  readonly origin: string
  readonly failOn: FailOn
  readonly wait: boolean
  readonly lang: SiteLang
  /** An absolute directory inside the workspace. */
  readonly sarifDir: string
  readonly timeoutMs: number
  readonly maxIssues: number
}

export const MAX_URLS = 10

/** The inputs action.yml declares, in its order (a test keeps the two equal). */
export const INPUT_NAMES = [
  'url',
  'urls',
  'api_key',
  'api_url',
  'fail_on',
  'wait',
  'lang',
  'sarif_dir',
  'timeout_seconds',
  'max_issues',
] as const

type Env = Readonly<Record<string, string | undefined>>
const input = (env: Env, name: string): string => env[`INPUT_${name.toUpperCase()}`]?.trim() ?? ''

function pages(env: Env): string[] {
  const parts = `${input(env, 'url')}\n${input(env, 'urls')}`
    .split(/[\s,]+/)
    .filter((part) => part !== '')
  const seen = new Set<string>()
  for (const part of parts) {
    let url: URL
    try {
      url = new URL(part)
    } catch {
      throw new InputError(
        `"${part.slice(0, 80)}" is not an address. Give a full http or https page address.`,
      )
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new InputError(`"${url.protocol}" addresses are not scanned: use http or https.`)
    }
    if (url.username !== '' || url.password !== '') {
      throw new InputError('A page address with a user name or password in it is never scanned.')
    }
    seen.add(url.href)
  }
  if (seen.size === 0)
    throw new InputError('Give the page to scan in `url` (or several in `urls`).')
  if (seen.size > MAX_URLS) throw new InputError(`At most ${String(MAX_URLS)} pages in one run.`)
  return [...seen]
}

function integer(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = input(env, name)
  if (raw === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new InputError(`\`${name}\` is a whole number from ${String(min)} to ${String(max)}.`)
  }
  return value
}

/** The workflow's `with:` values, from `INPUT_*` in the environment. Throws `InputError`. */
export function readInputs(env: Env): Inputs {
  const urls = pages(env)

  const apiKey = input(env, 'api_key')
  if (!API_KEY_PATTERN.test(apiKey)) {
    throw new InputError(
      '`api_key` must be an API key from your account page (it begins with arb_). Keep it in a repository secret.',
    )
  }

  const rawOrigin = input(env, 'api_url') || DEFAULT_ORIGIN
  let origin: URL
  try {
    origin = new URL(rawOrigin)
  } catch {
    throw new InputError(
      '`api_url` must be the address of your Arablyzer, such as https://arablyzer.com.',
    )
  }
  if (origin.protocol !== 'https:' && origin.protocol !== 'http:') {
    throw new InputError('`api_url` must start with https://.')
  }
  if (origin.username !== '' || origin.password !== '') {
    throw new InputError('`api_url` takes no user name or password.')
  }

  const failOn = (input(env, 'fail_on') || 'none').toLowerCase()
  if (failOn !== 'critical' && failOn !== 'serious' && failOn !== 'none') {
    throw new InputError('`fail_on` is critical, serious or none.')
  }

  const wait = (input(env, 'wait') || 'true').toLowerCase()
  if (wait !== 'true' && wait !== 'false') throw new InputError('`wait` is true or false.')

  const lang = (input(env, 'lang') || 'en').toLowerCase()
  if (lang !== 'ar' && lang !== 'en') throw new InputError('`lang` is ar or en.')

  const workspace = resolve(env.GITHUB_WORKSPACE ?? process.cwd())
  const sarifDir = resolve(workspace, input(env, 'sarif_dir') || 'arablyzer-sarif')
  const inside = relative(workspace, sarifDir)
  if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) {
    throw new InputError('`sarif_dir` must be a folder inside the workspace.')
  }

  return {
    urls,
    apiKey,
    origin: origin.origin + (origin.pathname === '/' ? '' : origin.pathname.replace(/\/+$/, '')),
    failOn,
    wait: wait === 'true',
    lang,
    sarifDir,
    timeoutMs: integer(env, 'timeout_seconds', 300, 30, 1800) * 1000,
    maxIssues: integer(env, 'max_issues', 10, 1, 50),
  }
}

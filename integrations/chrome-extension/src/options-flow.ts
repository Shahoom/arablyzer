import type { ApiClient } from '@arablyzer/integrations-core'
import { DEFAULT_ORIGIN } from '@arablyzer/integrations-core'
import type { INTEGRATIONS_UI, StartProblem } from '@arablyzer/i18n/integrations'
import type { ChromeApi } from './chrome-types'
import { problemOf } from './logic'
import {
  isApiKey,
  originPattern,
  parseHost,
  saveSettings,
  type LangSetting,
  type Settings,
} from './settings'

export interface Form {
  readonly apiKey: string
  readonly host: string
  readonly lang: LangSetting
}

export type OptionsProblem = 'badKey' | 'badHost' | 'permission' | 'noKey' | StartProblem
export type OptionsDone = 'saved' | 'testOk' | 'removed'
export type Outcome =
  | { readonly ok: true; readonly done: OptionsDone }
  | { readonly ok: false; readonly problem: OptionsProblem }

export interface OptionsDeps {
  readonly chrome: ChromeApi
  readonly makeClient: (settings: Settings) => ApiClient
}

/** Whether the extension may reach the origin: the default is in the manifest, another is asked for (from a click). */
async function mayReach(chrome: ChromeApi, host: string): Promise<boolean> {
  const origins = [originPattern(host)]
  if (await chrome.permissions.contains({ origins })) return true
  return chrome.permissions.request({ origins })
}

function checked(form: Form): { settings: Settings } | { problem: OptionsProblem } {
  const apiKey = form.apiKey.trim()
  if (apiKey !== '' && !isApiKey(apiKey)) return { problem: 'badKey' }
  const host = parseHost(form.host === '' ? DEFAULT_ORIGIN : form.host)
  if (host === null) return { problem: 'badHost' }
  return { settings: { apiKey, host, lang: form.lang } }
}

export async function save(deps: OptionsDeps, form: Form): Promise<Outcome> {
  const result = checked(form)
  if ('problem' in result) return { ok: false, problem: result.problem }
  if (!(await mayReach(deps.chrome, result.settings.host))) {
    return { ok: false, problem: 'permission' }
  }
  await saveSettings(deps.chrome.storage.sync, result.settings)
  return { ok: true, done: 'saved' }
}

/** Asks the service for the account's newest scan with the typed key: a read that costs nothing. */
export async function test(deps: OptionsDeps, form: Form): Promise<Outcome> {
  const result = checked(form)
  if ('problem' in result) return { ok: false, problem: result.problem }
  if (result.settings.apiKey === '') return { ok: false, problem: 'noKey' }
  if (!(await mayReach(deps.chrome, result.settings.host))) {
    return { ok: false, problem: 'permission' }
  }
  try {
    await deps.makeClient(result.settings).checkKey()
    return { ok: true, done: 'testOk' }
  } catch (error) {
    return { ok: false, problem: problemOf(error).key }
  }
}

export async function removeKey(deps: OptionsDeps, form: Form): Promise<Outcome> {
  const host = parseHost(form.host) ?? DEFAULT_ORIGIN
  await saveSettings(deps.chrome.storage.sync, { apiKey: '', host, lang: form.lang })
  return { ok: true, done: 'removed' }
}

export type OptionsStrings = (typeof INTEGRATIONS_UI)['ar']['extension']['options']

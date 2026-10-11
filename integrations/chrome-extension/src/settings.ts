import { API_KEY_PATTERN } from '@arablyzer/api-contract/codes'
import { DEFAULT_ORIGIN, type SiteLang } from '@arablyzer/integrations-core'
import type { StorageArea } from './chrome-types'

export type LangSetting = 'auto' | SiteLang

export interface Settings {
  readonly apiKey: string
  /** The service's origin. */
  readonly host: string
  readonly lang: LangSetting
}

export const DEFAULT_SETTINGS: Settings = { apiKey: '', host: DEFAULT_ORIGIN, lang: 'auto' }

const KEYS = ['apiKey', 'host', 'lang'] as const

export const isApiKey = (value: string): boolean => API_KEY_PATTERN.test(value)

/** The service address as an origin the extension may talk to, or null: https, or http on this machine. */
export function parseHost(input: string): string | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null
  if (url.username !== '' || url.password !== '') return null
  return url.origin
}

/** The permission pattern for an origin (`https://host:port/*`). */
export const originPattern = (origin: string): string => `${origin}/*`

/** What is stored, made safe: anything missing or odd falls back to the default. */
export async function loadSettings(area: StorageArea): Promise<Settings> {
  let stored: Record<string, unknown> = {}
  try {
    stored = await area.get([...KEYS])
  } catch {
    // Storage that cannot be read is storage with nothing in it.
  }
  const key = typeof stored.apiKey === 'string' ? stored.apiKey : ''
  const host = typeof stored.host === 'string' ? parseHost(stored.host) : null
  const lang = stored.lang
  return {
    apiKey: isApiKey(key) ? key : '',
    host: host ?? DEFAULT_SETTINGS.host,
    lang: lang === 'ar' || lang === 'en' ? lang : 'auto',
  }
}

export async function saveSettings(area: StorageArea, settings: Settings): Promise<void> {
  if (settings.apiKey === '') await area.remove('apiKey')
  await area.set({
    ...(settings.apiKey === '' ? {} : { apiKey: settings.apiKey }),
    host: settings.host,
    lang: settings.lang,
  })
}

/** The language the extension speaks: the setting, or the browser's (Arabic for Arabic, else English). */
export function pickLang(setting: LangSetting, uiLanguage: string): SiteLang {
  if (setting !== 'auto') return setting
  return uiLanguage.toLowerCase().startsWith('ar') ? 'ar' : 'en'
}

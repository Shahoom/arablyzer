import type { StartProblem } from '@arablyzer/i18n/integrations'
import {
  absolute,
  ApiError,
  scanFormUrl,
  waitForScan,
  type ApiClient,
  type Scan,
  type SiteLang,
} from '@arablyzer/integrations-core'
import type { ChromeApi } from './chrome-types'
import { badgeFor, presentReport, problemOf, scanTarget, type ResultView } from './logic'
import { loadSettings, originPattern, pickLang, type Settings } from './settings'

export type PopupState =
  | { readonly kind: 'loading' }
  /** The tab is not a web page (a new tab, a settings page, a file). */
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'no-key'; readonly url: string }
  | { readonly kind: 'ready'; readonly url: string }
  | { readonly kind: 'scanning'; readonly url: string; readonly phase: 'queued' | 'running' }
  | {
      readonly kind: 'done'
      readonly url: string
      readonly result: ResultView
      readonly reportUrl: string
    }
  | {
      readonly kind: 'error'
      readonly url: string
      readonly problem: StartProblem | 'noPermission'
      readonly retryAfterSeconds?: number
    }

/** What the popup shows with each state: the language, the service, and the page. */
export interface PopupContext {
  readonly lang: SiteLang
  readonly host: string
  readonly settings: Settings
}

export interface PopupDeps {
  readonly chrome: ChromeApi
  readonly makeClient: (settings: Settings) => ApiClient
  readonly sleep: (ms: number) => Promise<void>
  readonly now: () => number
}

export interface Popup {
  readonly context: PopupContext
  scan(): Promise<void>
  /** Without a key: the site's own scan form, with this page filled in. */
  openSite(): Promise<void>
  openSettings(): Promise<void>
}

/** A scan the popup started is picked up again if the popup is opened on the same page within this time (the API reuses it for as long). */
const RESUME_MS = 10 * 60 * 1000
/** How long the popup waits for a scan before saying it took too long; the scan goes on. */
const WAIT_MS = 3 * 60 * 1000
const LAST_SCAN = 'lastScan'

export async function startPopup(
  deps: PopupDeps,
  render: (state: PopupState, context: PopupContext | null) => void,
): Promise<Popup> {
  const { chrome } = deps
  render({ kind: 'loading' }, null)
  const settings = await loadSettings(chrome.storage.sync)
  const lang = pickLang(settings.lang, chrome.i18n.getUILanguage())
  const context: PopupContext = { lang, host: settings.host, settings }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const target = scanTarget(tab?.url)
  const show = (state: PopupState) => {
    render(state, context)
  }

  async function paintBadge(score: number | null): Promise<void> {
    if (tab?.id === undefined) return
    const badge = badgeFor(score)
    await chrome.action.setBadgeText({ text: badge.text, tabId: tab.id })
    await chrome.action.setBadgeBackgroundColor({ color: badge.color, tabId: tab.id })
  }

  async function finish(client: ApiClient, first: Scan, url: string): Promise<void> {
    const scan = await waitForScan({
      client,
      scanId: first.id,
      first,
      timeoutMs: WAIT_MS,
      sleep: deps.sleep,
      now: deps.now,
      onState: (seen) => {
        if (seen.state === 'queued' || seen.state === 'running') {
          show({ kind: 'scanning', url, phase: seen.state })
        }
      },
    })
    if (scan.state === 'failed') throw new ApiError('scan_failed', 'The scan failed.', 0)
    const report = await client.getReport(scan.id)
    const result = presentReport(report, settings.host, lang)
    await paintBadge(result.score)
    show({ kind: 'done', url, result, reportUrl: absolute(settings.host, scan.links.page) })
  }

  async function scan(): Promise<void> {
    if (target === null) return
    if (settings.apiKey === '') {
      show({ kind: 'no-key', url: target })
      return
    }
    show({ kind: 'scanning', url: target, phase: 'queued' })
    try {
      if (!(await chrome.permissions.contains({ origins: [originPattern(settings.host)] }))) {
        show({ kind: 'error', url: target, problem: 'noPermission' })
        return
      }
      const client = deps.makeClient(settings)
      const started = await client.startScan(target)
      await chrome.storage.session
        .set({ [LAST_SCAN]: { url: target, id: started.id, at: deps.now() } })
        .catch(() => undefined)
      await finish(client, started, target)
    } catch (error) {
      const { key, retryAfterSeconds } = problemOf(error)
      show({
        kind: 'error',
        url: target,
        problem: key,
        ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
      })
    }
  }

  /** The scan this popup started a moment ago on this page, if there is one: shown or awaited. */
  async function resume(url: string): Promise<boolean> {
    try {
      const stored = (await chrome.storage.session.get(LAST_SCAN))[LAST_SCAN] as
        { url?: unknown; id?: unknown; at?: unknown } | undefined
      if (
        stored?.url !== url ||
        typeof stored.id !== 'string' ||
        typeof stored.at !== 'number' ||
        deps.now() - stored.at > RESUME_MS
      ) {
        return false
      }
      if (!(await chrome.permissions.contains({ origins: [originPattern(settings.host)] }))) {
        return false
      }
      const client = deps.makeClient(settings)
      const first = await client.getScan(stored.id)
      if (first.state === 'failed') return false
      await finish(client, first, url)
      return true
    } catch {
      return false
    }
  }

  if (target === null) {
    show({ kind: 'unsupported' })
  } else if (settings.apiKey === '') {
    show({ kind: 'no-key', url: target })
  } else if (!(await resume(target))) {
    show({ kind: 'ready', url: target })
  }

  return {
    context,
    scan,
    async openSite() {
      await chrome.tabs.create({
        url:
          target === null
            ? `${settings.host}${lang === 'ar' ? '/' : '/en/'}`
            : scanFormUrl(settings.host, lang, target),
      })
    },
    async openSettings() {
      await chrome.runtime.openOptionsPage()
    },
  }
}

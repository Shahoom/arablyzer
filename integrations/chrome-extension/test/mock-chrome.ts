import { ApiError, type ApiClient, type Scan, type ScanStarted } from '@arablyzer/integrations-core'
import type { Report } from '@arablyzer/report-schema'
import type { ChromeApi, StorageArea } from '../src/chrome-types'

/** A storage area in memory. */
export function memoryArea(initial: Record<string, unknown> = {}): StorageArea & {
  data: Record<string, unknown>
} {
  const data: Record<string, unknown> = { ...initial }
  return {
    data,
    get: (keys) => {
      const names = keys === null ? Object.keys(data) : Array.isArray(keys) ? keys : [keys]
      return Promise.resolve(
        Object.fromEntries(names.filter((n) => n in data).map((n) => [n, data[n]])),
      )
    },
    set: (items) => {
      Object.assign(data, items)
      return Promise.resolve()
    },
    remove: (keys) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) Reflect.deleteProperty(data, key)
      return Promise.resolve()
    },
  }
}

export interface MockOptions {
  readonly tabUrl?: string | undefined
  readonly tabId?: number
  readonly sync?: Record<string, unknown>
  readonly session?: Record<string, unknown>
  readonly language?: string
  /** Origins the extension may reach, as patterns (the manifest's, plus any granted). */
  readonly granted?: readonly string[]
  /** What `permissions.request` answers. */
  readonly allowRequest?: boolean
}

export function mockChrome(options: MockOptions = {}) {
  const granted = new Set(options.granted ?? ['https://arablyzer.com/*'])
  const calls = {
    badgeText: [] as { text: string; tabId?: number }[],
    badgeColor: [] as { color: string; tabId?: number }[],
    created: [] as string[],
    requested: [] as string[][],
    optionsOpened: 0,
  }
  const sync = memoryArea(options.sync)
  const session = memoryArea(options.session)
  const chrome: ChromeApi = {
    storage: { sync, session },
    tabs: {
      query: () =>
        Promise.resolve([
          {
            ...(options.tabId === undefined ? { id: 7 } : { id: options.tabId }),
            ...('tabUrl' in options
              ? options.tabUrl === undefined
                ? {}
                : { url: options.tabUrl }
              : { url: 'https://shop.example/ar/?q=1#top' }),
          },
        ]),
      create: ({ url }) => {
        calls.created.push(url)
        return Promise.resolve({})
      },
    },
    action: {
      setBadgeText: (details) => {
        calls.badgeText.push(details)
        return Promise.resolve()
      },
      setBadgeBackgroundColor: (details) => {
        calls.badgeColor.push(details)
        return Promise.resolve()
      },
    },
    permissions: {
      contains: ({ origins }) => Promise.resolve(origins.every((o) => granted.has(o))),
      request: ({ origins }) => {
        calls.requested.push(origins)
        if (options.allowRequest === true) for (const o of origins) granted.add(o)
        return Promise.resolve(options.allowRequest === true)
      },
    },
    runtime: {
      openOptionsPage: () => {
        calls.optionsOpened++
        return Promise.resolve()
      },
    },
    i18n: { getUILanguage: () => options.language ?? 'ar' },
  }
  return { chrome, calls, sync, session }
}

export const ID = 'AbCdEfGhIjKlMnOpQrSt_-'
export const KEY = `arb_${'k'.repeat(43)}`

export const scan = (state: Scan['state'], extra: Partial<ScanStarted> = {}): ScanStarted => ({
  id: ID,
  url: 'https://shop.example/ar/?q=1',
  state,
  tool: null,
  createdAt: '2026-10-11T12:00:00.000Z',
  score: null,
  links: {
    status: `/api/v1/scans/${ID}`,
    report: `/api/v1/scans/${ID}/report`,
    page: `https://arablyzer.com/r/${ID}`,
  },
  reused: false,
  ...extra,
})

/** A client that answers from a script; `calls` records what was asked. */
export function fakeClient(script: {
  start?: () => Promise<ScanStarted>
  scans?: Scan[]
  report?: Report
  reportError?: ApiError
  check?: () => Promise<void>
}) {
  const calls: string[] = []
  const queue = [...(script.scans ?? [])]
  const client: ApiClient = {
    startScan: (url) => {
      calls.push(`start ${url}`)
      return script.start?.() ?? Promise.resolve(scan('queued'))
    },
    getScan: (id) => {
      calls.push(`get ${id}`)
      const next = queue.length > 1 ? queue.shift() : queue[0]
      return next === undefined
        ? Promise.reject(new ApiError('not_found', 'x', 404))
        : Promise.resolve(next)
    },
    getReport: (id) => {
      calls.push(`report ${id}`)
      if (script.reportError !== undefined) return Promise.reject(script.reportError)
      return script.report === undefined
        ? Promise.reject(new ApiError('report_not_ready', 'x', 409))
        : Promise.resolve(script.report)
    },
    checkKey: () => {
      calls.push('check')
      return script.check?.() ?? Promise.resolve()
    },
  }
  return { client, calls }
}

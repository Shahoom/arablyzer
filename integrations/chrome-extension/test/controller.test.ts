import { ApiError } from '@arablyzer/integrations-core'
import type { Report } from '@arablyzer/report-schema'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { startPopup, type PopupContext, type PopupState } from '../src/controller'
import { fakeClient, ID, KEY, mockChrome, scan, type MockOptions } from './mock-chrome'

const report = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../../fixtures/golden/reports/10-accessibility.json', import.meta.url),
    ),
    'utf8',
  ),
) as Report

async function open(
  chromeOptions: MockOptions,
  script: Parameters<typeof fakeClient>[0],
  now = () => 1_000_000,
) {
  const mock = mockChrome(chromeOptions)
  const fake = fakeClient(script)
  const states: PopupState[] = []
  let context: PopupContext | null = null
  const sleeps: number[] = []
  const popup = await startPopup(
    {
      chrome: mock.chrome,
      makeClient: () => fake.client,
      sleep: (ms) => {
        sleeps.push(ms)
        return Promise.resolve()
      },
      now,
    },
    (state, ctx) => {
      states.push(state)
      context = ctx
    },
  )
  return { popup, states, mock, fake, sleeps, context: () => context, last: () => states.at(-1) }
}

const withKey = { sync: { apiKey: KEY } }

describe('the popup', () => {
  it('without a key: shows the page and offers the site’s scan form with it filled in', async () => {
    const { popup, last, mock } = await open({}, {})
    expect(last()).toEqual({ kind: 'no-key', url: 'https://shop.example/ar/?q=1' })
    await popup.openSite()
    expect(mock.calls.created).toEqual([
      'https://arablyzer.com/?url=https%3A%2F%2Fshop.example%2Far%2F%3Fq%3D1',
    ])
    await popup.openSettings()
    expect(mock.calls.optionsOpened).toBe(1)
  })

  it('opens the English scan form for an English popup', async () => {
    const { popup, mock } = await open({ language: 'en-US' }, {})
    await popup.openSite()
    expect(mock.calls.created[0]).toMatch(/^https:\/\/arablyzer\.com\/en\/\?url=/)
  })

  it('says a tab that is not a web page cannot be scanned, with or without a key', async () => {
    expect((await open({ tabUrl: 'chrome://extensions' }, {})).last()).toEqual({
      kind: 'unsupported',
    })
    expect((await open({ ...withKey, tabUrl: undefined }, {})).last()).toEqual({
      kind: 'unsupported',
    })
  })

  it('with a key: ready, then scans, waits, shows the result and puts the score on the badge', async () => {
    const { popup, states, last, mock, fake, sleeps, context } = await open(withKey, {
      scans: [scan('running'), scan('complete', { score: 71 })],
      report,
    })
    expect(last()).toEqual({ kind: 'ready', url: 'https://shop.example/ar/?q=1' })
    await popup.scan()

    expect(fake.calls).toEqual([
      'start https://shop.example/ar/?q=1',
      `get ${ID}`,
      `get ${ID}`,
      `report ${ID}`,
    ])
    expect(sleeps.length).toBeGreaterThan(0)
    expect(states.map((s) => s.kind)).toEqual([
      'loading',
      'ready',
      'scanning',
      'scanning',
      'scanning',
      'done',
    ])
    const done = last()
    expect(done?.kind).toBe('done')
    if (done?.kind !== 'done') return
    expect(done.result.score).toBe(72)
    expect(done.result.issues[0]?.severity).toBe('critical')
    expect(done.reportUrl).toBe(`https://arablyzer.com/r/${ID}`)
    expect(context()?.lang).toBe('ar')
    expect(mock.calls.badgeText).toEqual([{ text: '72', tabId: 7 }])
    expect(mock.calls.badgeColor[0]?.tabId).toBe(7)
    expect(mock.session.data.lastScan).toMatchObject({
      url: 'https://shop.example/ar/?q=1',
      id: ID,
    })
  })

  it('a scan the API already has (reused) is shown without waiting', async () => {
    const { popup, last, sleeps } = await open(withKey, {
      start: () => Promise.resolve(scan('complete', { reused: true, score: 71 })),
      report,
    })
    await popup.scan()
    expect(last()?.kind).toBe('done')
    expect(sleeps).toEqual([])
  })

  it('explains what went wrong, in a state of its own', async () => {
    const cases: [ApiError, string, number | undefined][] = [
      [new ApiError('unauthorized', 'x', 401), 'unauthorized', undefined],
      [new ApiError('rate_limited', 'x', 429, { retryAfterSeconds: 30 }), 'rate_limited', 30],
      [new ApiError('blocked_target', 'x', 422), 'blocked_target', undefined],
      [new ApiError('network', 'x', 0), 'network', undefined],
    ]
    for (const [error, problem, retry] of cases) {
      const { popup, last, mock } = await open(withKey, { start: () => Promise.reject(error) })
      await popup.scan()
      expect(last()).toMatchObject({
        kind: 'error',
        problem,
        ...(retry === undefined ? {} : { retryAfterSeconds: retry }),
      })
      expect(mock.calls.badgeText).toEqual([])
    }
  })

  it('a scan that fails, or whose wait runs out, is an error and not a result', async () => {
    const failed = await open(withKey, {
      scans: [scan('failed')],
      start: () => Promise.resolve(scan('running')),
    })
    await failed.popup.scan()
    expect(failed.last()).toMatchObject({ kind: 'error', problem: 'scan_failed' })

    let time = 0
    const slow = await open(withKey, { scans: [scan('running')] }, () => {
      time += 100_000
      return time
    })
    await slow.popup.scan()
    expect(slow.last()).toMatchObject({ kind: 'error', problem: 'timeout' })
  })

  it('does not ask a service it has no permission for, and says so', async () => {
    const { popup, last, fake } = await open(
      { sync: { apiKey: KEY, host: 'https://arablyzer.example' } },
      {},
    )
    await popup.scan()
    expect(last()).toMatchObject({ kind: 'error', problem: 'noPermission' })
    expect(fake.calls).toEqual([])

    const granted = await open(
      {
        sync: { apiKey: KEY, host: 'https://arablyzer.example' },
        granted: ['https://arablyzer.example/*'],
      },
      { start: () => Promise.resolve(scan('complete', { score: 71 })), report },
    )
    await granted.popup.scan()
    expect(granted.last()?.kind).toBe('done')
  })

  it('picks up the scan it started a moment ago on the same page', async () => {
    const recent = { lastScan: { url: 'https://shop.example/ar/?q=1', id: ID, at: 999_000 } }
    const resumed = await open(
      { ...withKey, session: recent },
      { scans: [scan('running'), scan('complete', { score: 71 })], report },
    )
    expect(resumed.states.map((s) => s.kind)).toEqual(['loading', 'scanning', 'done'])
    expect(resumed.mock.calls.badgeText[0]?.text).toBe('72')

    // Too old, another page, or a failed scan: back to ready, with nothing asked of the API.
    const old = await open(
      { ...withKey, session: { lastScan: { ...recent.lastScan, at: 1 } } },
      { scans: [scan('complete')], report },
    )
    expect(old.last()?.kind).toBe('ready')
    expect(old.fake.calls).toEqual([])
    const other = await open(
      { ...withKey, session: { lastScan: { ...recent.lastScan, url: 'https://other.example/' } } },
      { scans: [scan('complete')], report },
    )
    expect(other.last()?.kind).toBe('ready')
    const failed = await open({ ...withKey, session: recent }, { scans: [scan('failed')] })
    expect(failed.last()?.kind).toBe('ready')
    const gone = await open({ ...withKey, session: recent }, { scans: [] })
    expect(gone.last()?.kind).toBe('ready')
  })

  it('shows English when the setting or the browser says so', async () => {
    const { context } = await open({ language: 'en-GB' }, {})
    expect(context()?.lang).toBe('en')
    const forced = await open({ sync: { lang: 'ar' }, language: 'en-GB' }, {})
    expect(forced.context()?.lang).toBe('ar')
  })
})

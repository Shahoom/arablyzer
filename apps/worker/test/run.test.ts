import { fileURLToPath } from 'node:url'
import type { ScanEvent } from '@arablyzer/api-contract'
import { createPolicy } from '@arablyzer/egress'
import { scan } from '@arablyzer/engine'
import { serveSite } from '@arablyzer/fixtures'
import type { Report } from '@arablyzer/report-schema'
import { MemoryScanEvents, MemoryScanStore } from '@arablyzer/store'
import { describe, expect, it } from 'vitest'
import { runScan, type Scanner } from '../src/run'

const NOW = new Date('2026-09-28T12:00:00Z')
const ID = 'AbCdEfGhIjKlMnOpQrSt_-'

async function stored(events: MemoryScanEvents): Promise<ScanEvent[]> {
  const stop = new AbortController()
  const seen: ScanEvent[] = []
  for await (const event of events.follow(ID, null, stop.signal)) {
    if (event === null) break
    seen.push(event.event)
    if (event.event.type === 'done' || event.event.type === 'error') break
  }
  stop.abort()
  return seen
}

async function setup() {
  const store = new MemoryScanStore()
  const events = new MemoryScanEvents(20)
  await store.create({ id: ID, url: 'https://example.com/', createdAt: NOW })
  return { store, events }
}

describe('runScan', () => {
  it('stores the report and tells the page every step, in order', async () => {
    const { store, events } = await setup()
    const report = { scan: { status: 'partial' } } as unknown as Report
    const scanner: Scanner = (_, options) => {
      options.onProgress?.({ step: 'page', status: 200, contentType: 'text/html', error: null })
      options.onProgress?.({ step: 'render-start', engine: 'firefox' })
      options.onProgress?.({ step: 'rules', rules: 47 })
      return Promise.resolve(report)
    }
    await runScan(
      { id: ID, url: 'https://example.com/' },
      { store, events, scanner, options: {}, now: () => NOW },
    )
    expect(await store.get(ID)).toMatchObject({
      state: 'partial',
      startedAt: NOW,
      finishedAt: NOW,
      report,
    })
    expect(await stored(events)).toEqual([
      { type: 'started', engines: [] },
      { type: 'page', status: 200, contentType: 'text/html', error: null },
      { type: 'render-start', engine: 'firefox' },
      { type: 'rules', rules: 47 },
      { type: 'done', state: 'partial' },
    ])
  })

  it('fails a scan that could not run, with no report, and says so', async () => {
    const { store, events } = await setup()
    const logged: string[] = []
    await runScan(
      { id: ID, url: 'https://example.com/' },
      {
        store,
        events,
        scanner: () => Promise.reject(new Error('the browser crashed')),
        options: {},
        now: () => NOW,
        log: (message) => logged.push(message),
      },
    )
    expect(await store.get(ID)).toMatchObject({ state: 'failed', report: null })
    expect(await stored(events)).toEqual([{ type: 'started', engines: [] }, { type: 'error' }])
    expect(logged).toEqual([`Scan ${ID} could not run: the browser crashed`])
  })

  it('runs the engine on a golden page, from the job to the stored report', async () => {
    const site = await serveSite(
      fileURLToPath(new URL('../../../fixtures/golden/sites/20-clean-contact/', import.meta.url)),
    )
    try {
      const { store, events } = await setup()
      await runScan(
        { id: ID, url: site.url('/') },
        {
          store,
          events,
          scanner: scan,
          options: {
            policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
          },
          now: () => NOW,
        },
      )
      const record = await store.get(ID)
      expect(record?.state).toBe('complete')
      expect(record?.report?.target.url).toBe(site.url('/'))
      const seen = await stored(events)
      expect(seen[0]).toEqual({ type: 'started', engines: [] })
      expect(seen[1]).toEqual({
        type: 'page',
        status: 200,
        contentType: 'text/html; charset=utf-8',
        error: null,
      })
      expect(seen.at(-1)).toEqual({ type: 'done', state: 'complete' })
    } finally {
      await site.close()
    }
  })
})
